<?php

declare(strict_types=1);

namespace App\Payment;

use App\Entity\Payment;
use App\Entity\Subscription;
use App\Entity\User;
use App\Repository\PaymentRepository;
use App\Repository\SubscriptionRepository;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Clock\ClockInterface;
use Psr\Log\LoggerInterface;

/**
 * Turns a verified transaction into 30 days of access, once. Atomic and idempotent: the payment row and the
 * account row are locked, so two simultaneous checks of the same payment (or two payments of the same account)
 * run one after the other, and the second one sees the first one's result.
 */
class SubscriptionService
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly PaymentRepository $payments,
        private readonly SubscriptionRepository $subscriptions,
        private readonly PaymentConfig $config,
        private readonly ClockInterface $clock,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function find(User $user): ?Subscription
    {
        return $this->subscriptions->findForUser($user);
    }

    public function isActive(User $user): bool
    {
        return true === $this->find($user)?->isActive($this->clock->now());
    }

    public function activate(Payment $payment, VerifiedPayment $verified): Subscription
    {
        try {
            // Refusals are returned, not thrown: an exception inside the transaction would close the entity manager.
            $subscription = $this->em->wrapInTransaction(function () use ($payment, $verified): ?Subscription {
                $now = $this->clock->now();
                $this->em->lock($payment->getUser(), LockMode::PESSIMISTIC_WRITE);
                $this->em->refresh($payment, LockMode::PESSIMISTIC_WRITE);
                $subscription = $this->subscriptions->findForUser($payment->getUser());
                if (Payment::CONFIRMED === $payment->getStatus()) {
                    return $payment->getTransactionSignature() === $verified->signature ? $subscription : null;
                }
                if ($this->payments->isSignatureUsed($verified->signature, $payment)) {
                    return null;
                }
                if (null === $subscription) {
                    $subscription = new Subscription($payment->getUser(), $now);
                    $this->em->persist($subscription);
                }
                $payment->markConfirmed($verified->signature, $verified->payer, $now);
                $subscription->extend($payment, $this->config->durationDays, $now);
                $this->em->flush();

                return $subscription;
            });
        } catch (UniqueConstraintViolationException) {
            // Another payment recorded the same signature in between: the database refused the second one.
            $this->em->clear();
            throw new PaymentError('PAYMENT_ALREADY_USED');
        }
        if (null === $subscription) {
            throw new PaymentError('PAYMENT_ALREADY_USED');
        }
        $this->logger->info('Abonnement prolongé', [
            'payment' => $payment->getId(),
            'user' => $payment->getUser()->getId(),
            'signature' => $verified->signature,
            'expires_at' => $subscription->getExpiresAt()->format(\DATE_ATOM),
        ]);

        return $subscription;
    }
}
