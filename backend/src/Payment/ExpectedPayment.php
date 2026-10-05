<?php

declare(strict_types=1);

namespace App\Payment;

/**
 * What a transaction must contain to pay one payment request. Built from the database, never from the browser.
 */
final class ExpectedPayment
{
    public function __construct(
        public readonly string $signature,
        /** Wallet that must sign the transfer; null for a QR code payment, where any wallet may pay. */
        public readonly ?string $payer,
        /** Wallet (owner) of the platform: the USDC must land in one of its token accounts. */
        public readonly string $recipient,
        public readonly string $mint,
        public readonly int $amountAtomic,
        public readonly string $memo,
        /** Solana Pay reference key: a read-only, non-signer account that ties the transaction to the request. */
        public readonly string $reference,
        public readonly \DateTimeImmutable $createdAt,
        public readonly \DateTimeImmutable $expiresAt,
    ) {
    }
}
