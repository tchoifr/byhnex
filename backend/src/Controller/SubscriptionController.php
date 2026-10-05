<?php

declare(strict_types=1);

namespace App\Controller;

use App\Api\ApiException;
use App\Api\ApiResponse;
use App\Api\JsonBody;
use App\Bot\BotAccessToken;
use App\Entity\Payment;
use App\Entity\Subscription;
use App\Entity\User;
use App\Payment\PaymentConfig;
use App\Payment\PaymentError;
use App\Payment\SolanaPaymentService;
use App\Payment\SubscriptionService;
use App\Payment\TokenAmount;
use App\Repository\PaymentRepository;
use Psr\Clock\ClockInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactory;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Bot subscription: 1 USDC on Solana for 30 days. The page never activates anything: it sends a transaction
 * signature, and the server reads the blockchain before granting access.
 */
#[IsGranted('IS_AUTHENTICATED')]
final class SubscriptionController
{
    private const STATUS = [
        'PAYMENT_INTENT_NOT_FOUND' => 404,
        'PAYMENT_INTENT_EXPIRED' => 410,
        'PAYMENT_ALREADY_USED' => 409,
        'RPC_UNAVAILABLE' => 503,
        'PAYMENTS_NOT_CONFIGURED' => 503,
    ];

    public function __construct(
        private readonly SolanaPaymentService $payments,
        private readonly SubscriptionService $subscriptions,
        private readonly PaymentRepository $paymentRepository,
        private readonly PaymentConfig $config,
        private readonly BotAccessToken $botToken,
        private readonly ClockInterface $clock,
        #[Autowire(service: 'limiter.payment_intent')] private readonly RateLimiterFactory $intentLimiter,
        #[Autowire(service: 'limiter.payment_verify')] private readonly RateLimiterFactory $verifyLimiter,
        #[Autowire(service: 'limiter.payment_refresh')] private readonly RateLimiterFactory $refreshLimiter,
    ) {
    }

    #[Route('/subscription/me', name: 'subscription_me', methods: ['GET'])]
    public function me(#[CurrentUser] User $user): JsonResponse
    {
        $open = $this->paymentRepository->findOpen($user);

        return ApiResponse::json([
            'subscription' => $this->subscriptionView($this->subscriptions->find($user)),
            'pendingPayment' => null === $open ? null : $this->paymentView($open),
            'offer' => [
                'available' => $this->config->isConfigured(),
                'price' => TokenAmount::toDecimal($this->config->priceAtomic, PaymentConfig::USDC_DECIMALS),
                'token' => 'USDC',
                'network' => $this->config->network,
                'durationDays' => $this->config->durationDays,
            ],
        ]);
    }

    #[Route('/subscription/payment-intent', name: 'subscription_intent', methods: ['POST'])]
    public function createIntent(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $in = JsonBody::read($request);
        $this->limit($this->intentLimiter, $user);
        $method = Payment::METHOD_QR === ($in['method'] ?? null) ? Payment::METHOD_QR : Payment::METHOD_WALLET;
        $payment = $this->call(fn () => $this->payments->createIntent($user, $method, $in['walletAddress'] ?? null));
        $view = $this->paymentView($payment);
        if (Payment::METHOD_WALLET === $method) {
            // Fetched here so the page never needs its own RPC access (the RPC key stays on the server).
            $view['blockhash'] = $this->call(fn () => $this->payments->latestBlockhash());
        }

        return ApiResponse::json(['payment' => $view], 201);
    }

    #[Route('/subscription/blockhash', name: 'subscription_blockhash', methods: ['GET'])]
    public function blockhash(#[CurrentUser] User $user): JsonResponse
    {
        $this->limit($this->refreshLimiter, $user);

        return ApiResponse::json(['blockhash' => $this->call(fn () => $this->payments->latestBlockhash())]);
    }

    #[Route('/subscription/payment/verify', name: 'subscription_verify', methods: ['POST'])]
    public function verify(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $in = JsonBody::read($request);
        $this->limit($this->verifyLimiter, $user);
        $id = $in['paymentId'] ?? $in['paymentIntentId'] ?? null;
        if (!\is_string($id) || !self::isUuid($id)) {
            throw $this->error(new PaymentError('PAYMENT_INTENT_NOT_FOUND'));
        }
        try {
            $payment = $this->payments->verify($user, $id, $in['signature'] ?? $in['transactionSignature'] ?? null);
        } catch (PaymentError $e) {
            if ('TRANSACTION_PENDING' === $e->errorCode || 'TRANSACTION_NOT_FOUND' === $e->errorCode) {
                $payment = $this->paymentRepository->findForUser($user, $id);

                return ApiResponse::json([
                    'payment' => null === $payment ? null : $this->paymentView($payment),
                    'pending' => ['code' => $e->errorCode, 'message' => $e->getMessage()],
                ], 202);
            }
            throw $this->error($e);
        }

        return ApiResponse::json([
            'payment' => $this->paymentView($payment),
            'subscription' => $this->subscriptionView($this->subscriptions->find($user)),
        ]);
    }

    #[Route('/subscription/payment/{id}', name: 'subscription_payment', methods: ['GET'])]
    public function payment(string $id, #[CurrentUser] User $user): JsonResponse
    {
        $payment = self::isUuid($id) ? $this->paymentRepository->findForUser($user, $id) : null;
        if (null === $payment) {
            throw $this->error(new PaymentError('PAYMENT_INTENT_NOT_FOUND'));
        }
        if ($payment->isOpen() && $this->refreshLimiter->create('u'.$user->getId())->consume()->isAccepted()) {
            $payment = $this->payments->refresh($payment);
        }

        return ApiResponse::json([
            'payment' => $this->paymentView($payment),
            'subscription' => $this->subscriptionView($this->subscriptions->find($user)),
        ]);
    }

    #[Route('/subscription/payments', name: 'subscription_history', methods: ['GET'])]
    public function history(#[CurrentUser] User $user): JsonResponse
    {
        return ApiResponse::json(['payments' => array_map($this->paymentView(...), $this->paymentRepository->history($user))]);
    }

    /**
     * Code for the subscribers' bot server, refused without an active subscription.
     */
    #[Route('/bot/token', name: 'bot_token', methods: ['POST'])]
    public function botToken(#[CurrentUser] User $user): JsonResponse
    {
        $subscription = $this->subscriptions->find($user);
        if (null === $subscription || !$subscription->isActive($this->clock->now())) {
            throw new ApiException(403, 'SUBSCRIPTION_REQUIRED', 'Un abonnement actif est nécessaire pour utiliser le bot.');
        }
        if (!$this->botToken->isConfigured()) {
            throw new ApiException(503, 'BOT_NOT_CONFIGURED', 'Le serveur du bot est en cours d’installation.');
        }

        return ApiResponse::json([
            'token' => $this->botToken->issue((int) $user->getId(), $subscription->getExpiresAt()),
            'url' => $this->botToken->serverUrl,
            'expiresAt' => self::date($subscription->getExpiresAt()),
        ]);
    }

    /**
     * @template T
     *
     * @param callable(): T $action
     *
     * @return T
     */
    private function call(callable $action): mixed
    {
        try {
            return $action();
        } catch (PaymentError $e) {
            throw $this->error($e);
        }
    }

    private function error(PaymentError $e): ApiException
    {
        return new ApiException(self::STATUS[$e->errorCode] ?? 422, $e->errorCode, $e->getMessage());
    }

    private function limit(RateLimiterFactory $factory, User $user): void
    {
        if (!$factory->create('u'.$user->getId())->consume()->isAccepted()) {
            throw new ApiException(429, 'too_many_attempts', 'Trop de tentatives. Réessayez dans quelques minutes.');
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function subscriptionView(?Subscription $subscription): ?array
    {
        if (null === $subscription) {
            return null;
        }
        $active = $subscription->isActive($this->clock->now());

        return [
            'status' => $active ? 'active' : 'expired',
            'active' => $active,
            'startsAt' => self::date($subscription->getStartsAt()),
            'expiresAt' => self::date($subscription->getExpiresAt()),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function paymentView(Payment $payment): array
    {
        $signature = $payment->getTransactionSignature();
        $label = rawurlencode('Byhnex');
        $message = rawurlencode(sprintf('Bot Byhnex : %d jours', $this->config->durationDays));

        return [
            'id' => $payment->getId(),
            'status' => $payment->getStatus(),
            'method' => $payment->getMethod(),
            'network' => $payment->getNetwork(),
            'token' => $payment->getToken(),
            'tokenMint' => $payment->getTokenMint(),
            'decimals' => PaymentConfig::USDC_DECIMALS,
            'amount' => $payment->getAmount(),
            'amountAtomic' => (string) $payment->getAmountAtomic(),
            'recipient' => $payment->getRecipient(),
            'walletAddress' => $payment->getWalletAddress(),
            'memo' => $payment->getMemo(),
            'reference' => $payment->getReference(),
            'createdAt' => self::date($payment->getCreatedAt()),
            'expiresAt' => self::date($payment->getExpiresAt()),
            'confirmedAt' => null === $payment->getConfirmedAt() ? null : self::date($payment->getConfirmedAt()),
            'transactionSignature' => $signature,
            'explorerUrl' => null === $signature ? null : $this->config->explorerUrl($signature),
            'failureReason' => $payment->getFailureReason(),
            'solanaPayUrl' => sprintf(
                'solana:%s?amount=%s&spl-token=%s&reference=%s&label=%s&message=%s&memo=%s',
                $payment->getRecipient(),
                rtrim(TokenAmount::toDecimal($payment->getAmountAtomic(), PaymentConfig::USDC_DECIMALS, 0), '.'),
                $payment->getTokenMint(),
                $payment->getReference(),
                $label,
                $message,
                $payment->getMemo(),
            ),
        ];
    }

    private static function isUuid(string $id): bool
    {
        return 1 === preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $id);
    }

    private static function date(\DateTimeImmutable $date): string
    {
        return $date->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }
}
