<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\SubscriptionRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * Bot access of one account. expires_at is the only source of truth: access is active while it is in the future.
 */
#[ORM\Entity(repositoryClass: SubscriptionRepository::class)]
#[ORM\Table(name: 'subscriptions')]
#[ORM\UniqueConstraint(name: 'subscriptions_user', columns: ['user_id'])]
class Subscription
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT, options: ['unsigned' => true])]
    private int|string|null $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $startsAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $expiresAt;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Payment $lastPayment = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $updatedAt;

    public function __construct(User $user, \DateTimeImmutable $now)
    {
        $this->user = $user;
        $this->startsAt = $now;
        $this->expiresAt = $now;
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getStartsAt(): \DateTimeImmutable
    {
        return $this->startsAt;
    }

    public function getExpiresAt(): \DateTimeImmutable
    {
        return $this->expiresAt;
    }

    public function getLastPayment(): ?Payment
    {
        return $this->lastPayment;
    }

    public function isActive(\DateTimeImmutable $now): bool
    {
        return $this->expiresAt > $now;
    }

    /**
     * Adds a period after the current end (or from now when it has already ended): paying early never loses days.
     */
    public function extend(Payment $payment, int $days, \DateTimeImmutable $now): void
    {
        if (!$this->isActive($now)) {
            $this->startsAt = $now;
        }
        $from = $this->expiresAt > $now ? $this->expiresAt : $now;
        $this->expiresAt = $from->modify(sprintf('+%d days', $days));
        $this->lastPayment = $payment;
        $this->updatedAt = $now;
    }
}
