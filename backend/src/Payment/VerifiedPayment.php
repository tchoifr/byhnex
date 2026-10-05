<?php

declare(strict_types=1);

namespace App\Payment;

/**
 * A transaction that pays a payment request exactly.
 */
final class VerifiedPayment
{
    public function __construct(
        public readonly string $signature,
        /** Wallet that signed the USDC transfer. */
        public readonly string $payer,
        public readonly int $amountAtomic,
        public readonly int $slot,
        public readonly \DateTimeImmutable $blockTime,
    ) {
    }
}
