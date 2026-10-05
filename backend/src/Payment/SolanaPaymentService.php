<?php

declare(strict_types=1);

namespace App\Payment;

use App\Entity\Payment;
use App\Entity\User;
use App\Repository\PaymentRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Clock\ClockInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Payment requests (PaymentIntent) and their on-chain verification. The platform wallet only receives:
 * no private key is ever needed, and nothing the browser says is trusted without reading the blockchain.
 */
class SolanaPaymentService
{
    /** Below this, the wallet cannot pay the network fee (≈ 0.000005 SOL, plus priority fees). */
    public const MIN_LAMPORTS = 50_000;

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PaymentRepository $payments,
        private readonly SolanaRpcClient $rpc,
        private readonly SolanaTransactionVerifier $verifier,
        private readonly SubscriptionService $subscriptions,
        private readonly PaymentConfig $config,
        private readonly ClockInterface $clock,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function createIntent(User $user, string $method, mixed $wallet): Payment
    {
        $this->assertConfigured();
        if (Payment::METHOD_WALLET === $method) {
            if (null === $wallet || '' === $wallet) {
                throw new PaymentError('WALLET_NOT_CONNECTED');
            }
            if (!Base58::isPublicKey($wallet)) {
                throw new PaymentError('INVALID_WALLET');
            }
            $this->assertFunds((string) $wallet);
        } else {
            $method = Payment::METHOD_QR;
            $wallet = null;
        }
        $this->assertCluster();

        $now = $this->clock->now();
        $payment = new Payment(
            Uuid::v4()->toRfc4122(),
            $user,
            $method,
            $wallet,
            $this->config->network,
            $this->config->usdcMint,
            $this->config->platformWallet,
            TokenAmount::toDecimal($this->config->priceAtomic, PaymentConfig::USDC_DECIMALS, PaymentConfig::USDC_DECIMALS),
            $this->config->priceAtomic,
            'SUB_'.Uuid::v4()->toRfc4122(),
            Base58::encode(random_bytes(32)),
            $now,
            $now->modify(sprintf('+%d minutes', $this->config->intentTtlMinutes)),
        );
        $this->em->persist($payment);
        $this->em->flush();
        $this->logger->info('Demande de paiement créée', ['payment' => $payment->getId(), 'user' => $user->getId(), 'method' => $method, 'wallet' => $wallet]);

        return $payment;
    }

    /**
     * Checks a signature sent by the page after the wallet signed. Returns the payment, confirmed or still processing.
     */
    public function verify(User $user, string $paymentId, mixed $signature): Payment
    {
        $payment = $this->payments->findForUser($user, $paymentId) ?? throw new PaymentError('PAYMENT_INTENT_NOT_FOUND');
        if (!Base58::isSignature($signature)) {
            throw new PaymentError('INVALID_SIGNATURE');
        }
        $signature = (string) $signature;
        if (Payment::CONFIRMED === $payment->getStatus()) {
            if ($payment->getTransactionSignature() === $signature) {
                return $payment;
            }
            throw new PaymentError('PAYMENT_ALREADY_USED');
        }
        if ($this->payments->isSignatureUsed($signature, $payment)) {
            $this->logger->warning('Signature déjà utilisée', ['payment' => $payment->getId(), 'signature' => $signature]);
            throw new PaymentError('PAYMENT_ALREADY_USED');
        }
        $this->assertConfigured();
        $this->assertCluster();

        try {
            $this->check($payment, $signature);
        } catch (PaymentError $e) {
            if ('TRANSACTION_NOT_FOUND' !== $e->errorCode && 'TRANSACTION_PENDING' !== $e->errorCode && $this->em->isOpen()) {
                $payment->noteRejection($e->errorCode, $this->clock->now());
                $this->em->flush();
                $this->logger->warning('Transaction refusée', ['payment' => $payment->getId(), 'signature' => $signature, 'reason' => $e->errorCode]);
            }
            throw $e;
        }

        return $payment;
    }

    /**
     * Brings an open request up to date (page polling): rechecks its transaction, or looks for one through the
     * Solana Pay reference (QR code payments, or a page closed right after signing). RPC failures leave it as is.
     */
    public function refresh(Payment $payment): Payment
    {
        if (!$payment->isOpen() || !$this->config->isConfigured()) {
            return $payment;
        }
        try {
            $this->assertCluster();
            $known = $payment->getTransactionSignature();
            $candidates = null !== $known ? [$known] : array_column(
                array_filter($this->rpc->getSignaturesForAddress($payment->getReference(), 'confirmed'), static fn (array $row): bool => null === $row['err']),
                'signature',
            );
            foreach ($candidates as $signature) {
                if (null === $known && $this->payments->isSignatureUsed($signature, $payment)) {
                    continue;
                }
                try {
                    $this->check($payment, $signature);
                    break;
                } catch (PaymentError $e) {
                    if ('TRANSACTION_PENDING' === $e->errorCode || !$this->em->isOpen()) {
                        break;
                    }
                    if ('TRANSACTION_NOT_FOUND' !== $e->errorCode) {
                        $payment->noteRejection($e->errorCode, $this->clock->now());
                        $this->logger->warning('Transaction refusée', ['payment' => $payment->getId(), 'signature' => $signature, 'reason' => $e->errorCode]);
                    }
                }
            }
        } catch (RpcUnavailable|PaymentError $e) {
            $this->logger->warning('Vérification reportée', ['payment' => $payment->getId(), 'error' => $e->getMessage()]);

            return $payment;
        }
        $now = $this->clock->now();
        // Nothing seen on chain well after the deadline: the request is closed (a late transaction is still accepted by verify()).
        if (Payment::PENDING === $payment->getStatus()
            && $now > $payment->getExpiresAt()->modify(sprintf('+%d seconds', 2 * PaymentConfig::EXPIRY_GRACE_SECONDS))) {
            $payment->markExpired($now);
        }
        if ($this->em->isOpen()) {
            $this->em->flush();
        }

        return $payment;
    }

    /**
     * @return array{blockhash: string, lastValidBlockHeight: int}
     */
    public function latestBlockhash(): array
    {
        $this->assertConfigured();
        $this->assertCluster();
        try {
            return $this->rpc->getLatestBlockhash();
        } catch (RpcUnavailable) {
            throw new PaymentError('RPC_UNAVAILABLE');
        }
    }

    private function check(Payment $payment, string $signature): void
    {
        $expected = new ExpectedPayment(
            $signature,
            $payment->getWalletAddress() && Payment::METHOD_WALLET === $payment->getMethod() ? $payment->getWalletAddress() : null,
            $payment->getRecipient(),
            $payment->getTokenMint(),
            $payment->getAmountAtomic(),
            $payment->getMemo(),
            $payment->getReference(),
            $payment->getCreatedAt(),
            $payment->getExpiresAt(),
        );
        try {
            $finalized = true;
            $tx = $this->rpc->getTransaction($signature, 'finalized');
            if (null === $tx) {
                $finalized = false;
                $tx = $this->rpc->getTransaction($signature, 'confirmed');
            }
        } catch (RpcUnavailable) {
            throw new PaymentError('RPC_UNAVAILABLE');
        }
        if (null === $tx) {
            throw new PaymentError('TRANSACTION_NOT_FOUND');
        }
        $verified = $this->verifier->verify($tx, $expected);
        if (!$finalized) {
            $payment->markProcessing($verified->signature, $verified->payer, $this->clock->now());
            $this->em->flush();
            throw new PaymentError('TRANSACTION_PENDING');
        }
        $this->subscriptions->activate($payment, $verified);
    }

    private function assertConfigured(): void
    {
        if (!$this->config->isConfigured()) {
            throw new PaymentError('PAYMENTS_NOT_CONFIGURED');
        }
    }

    /** The RPC must serve the configured network: a devnet transfer must never pay a mainnet subscription. */
    private function assertCluster(): void
    {
        try {
            $genesis = $this->rpc->getGenesisHash();
        } catch (RpcUnavailable) {
            throw new PaymentError('RPC_UNAVAILABLE');
        }
        if ($genesis !== $this->config->expectedGenesis()) {
            $this->logger->critical('Le RPC Solana ne sert pas le réseau configuré', ['network' => $this->config->network]);
            throw new PaymentError('RPC_UNAVAILABLE');
        }
    }

    private function assertFunds(string $wallet): void
    {
        try {
            $usdc = $this->rpc->getTokenBalance($wallet, $this->config->usdcMint);
            $lamports = $this->rpc->getBalance($wallet);
        } catch (RpcUnavailable) {
            // The balance is only a courtesy check: the payment itself is verified on chain.
            return;
        }
        if ($usdc < $this->config->priceAtomic) {
            throw new PaymentError('INSUFFICIENT_USDC');
        }
        if ($lamports < self::MIN_LAMPORTS) {
            throw new PaymentError('INSUFFICIENT_SOL');
        }
    }
}
