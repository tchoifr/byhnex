<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\PaymentRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * A payment request (PaymentIntent) and, once paid, the Solana transaction that settled it.
 * Status: pending → processing (seen and verified, not finalized yet) → confirmed; or expired when nothing was paid in time.
 */
#[ORM\Entity(repositoryClass: PaymentRepository::class)]
#[ORM\Table(name: 'payments')]
#[ORM\UniqueConstraint(name: 'payments_memo', columns: ['memo'])]
#[ORM\UniqueConstraint(name: 'payments_reference', columns: ['reference'])]
#[ORM\UniqueConstraint(name: 'payments_signature', columns: ['transaction_signature'])]
#[ORM\Index(name: 'payments_user_created', columns: ['user_id', 'created_at'])]
class Payment
{
    public const PENDING = 'pending';
    public const PROCESSING = 'processing';
    public const CONFIRMED = 'confirmed';
    public const EXPIRED = 'expired';

    public const METHOD_WALLET = 'wallet';
    public const METHOD_QR = 'qr';

    #[ORM\Id]
    #[ORM\Column(type: Types::GUID)]
    private string $id;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(length: 8)]
    private string $method;

    #[ORM\Column(length: 44, nullable: true)]
    private ?string $walletAddress;

    #[ORM\Column(length: 16)]
    private string $network;

    #[ORM\Column(length: 8)]
    private string $token = 'USDC';

    #[ORM\Column(length: 44)]
    private string $tokenMint;

    #[ORM\Column(length: 44)]
    private string $recipient;

    #[ORM\Column(type: Types::DECIMAL, precision: 18, scale: 6)]
    private string $amount;

    #[ORM\Column(type: Types::BIGINT, options: ['unsigned' => true])]
    private int|string $amountAtomic;

    #[ORM\Column(length: 64)]
    private string $memo;

    #[ORM\Column(length: 44)]
    private string $reference;

    #[ORM\Column(length: 88, nullable: true)]
    private ?string $transactionSignature = null;

    #[ORM\Column(length: 16)]
    private string $status = self::PENDING;

    #[ORM\Column(length: 40, nullable: true)]
    private ?string $failureReason = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $expiresAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $confirmedAt = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $updatedAt;

    public function __construct(
        string $id,
        User $user,
        string $method,
        ?string $walletAddress,
        string $network,
        string $tokenMint,
        string $recipient,
        string $amount,
        int $amountAtomic,
        string $memo,
        string $reference,
        \DateTimeImmutable $createdAt,
        \DateTimeImmutable $expiresAt,
    ) {
        $this->id = $id;
        $this->user = $user;
        $this->method = $method;
        $this->walletAddress = $walletAddress;
        $this->network = $network;
        $this->tokenMint = $tokenMint;
        $this->recipient = $recipient;
        $this->amount = $amount;
        $this->amountAtomic = $amountAtomic;
        $this->memo = $memo;
        $this->reference = $reference;
        $this->createdAt = $createdAt;
        $this->expiresAt = $expiresAt;
        $this->updatedAt = $createdAt;
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getMethod(): string
    {
        return $this->method;
    }

    public function getWalletAddress(): ?string
    {
        return $this->walletAddress;
    }

    public function getNetwork(): string
    {
        return $this->network;
    }

    public function getToken(): string
    {
        return $this->token;
    }

    public function getTokenMint(): string
    {
        return $this->tokenMint;
    }

    public function getRecipient(): string
    {
        return $this->recipient;
    }

    public function getAmount(): string
    {
        return $this->amount;
    }

    public function getAmountAtomic(): int
    {
        // BIGINT columns come back as strings with some drivers.
        return (int) $this->amountAtomic;
    }

    public function getMemo(): string
    {
        return $this->memo;
    }

    public function getReference(): string
    {
        return $this->reference;
    }

    public function getTransactionSignature(): ?string
    {
        return $this->transactionSignature;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function getFailureReason(): ?string
    {
        return $this->failureReason;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getExpiresAt(): \DateTimeImmutable
    {
        return $this->expiresAt;
    }

    public function getConfirmedAt(): ?\DateTimeImmutable
    {
        return $this->confirmedAt;
    }

    public function isOpen(): bool
    {
        return self::PENDING === $this->status || self::PROCESSING === $this->status;
    }

    /** Seen on chain and fully verified, waiting for finalization. */
    public function markProcessing(string $signature, string $payer, \DateTimeImmutable $now): void
    {
        $this->transactionSignature = $signature;
        $this->walletAddress = $payer;
        $this->status = self::PROCESSING;
        $this->failureReason = null;
        $this->updatedAt = $now;
    }

    public function markConfirmed(string $signature, string $payer, \DateTimeImmutable $now): void
    {
        $this->transactionSignature = $signature;
        $this->walletAddress = $payer;
        $this->status = self::CONFIRMED;
        $this->failureReason = null;
        $this->confirmedAt = $now;
        $this->updatedAt = $now;
    }

    /** Last reason a submitted transaction was refused; the request stays open for the right one. */
    public function noteRejection(string $reason, \DateTimeImmutable $now): void
    {
        $this->failureReason = $reason;
        $this->updatedAt = $now;
    }

    public function markExpired(\DateTimeImmutable $now): void
    {
        $this->status = self::EXPIRED;
        $this->updatedAt = $now;
    }
}
