<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\AuthSessionRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * A signed-in device. Only the SHA-256 of the cookie token is stored.
 */
#[ORM\Entity(repositoryClass: AuthSessionRepository::class)]
#[ORM\Table(name: 'sessions')]
#[ORM\UniqueConstraint(name: 'sessions_token', columns: ['token_hash'])]
#[ORM\Index(name: 'sessions_expiry', columns: ['expires_at'])]
class AuthSession
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT, options: ['unsigned' => true])]
    private int|string|null $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(length: 64, options: ['fixed' => true])]
    private string $tokenHash;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $expiresAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $lastSeenAt;

    #[ORM\Column(length: 255, options: ['default' => ''])]
    private string $userAgent;

    public function __construct(User $user, string $tokenHash, \DateTimeImmutable $now, \DateTimeImmutable $expiresAt, string $userAgent)
    {
        $this->user = $user;
        $this->tokenHash = $tokenHash;
        $this->createdAt = $now;
        $this->lastSeenAt = $now;
        $this->expiresAt = $expiresAt;
        $this->userAgent = mb_substr($userAgent, 0, 255);
    }

    public function getId(): int|string|null
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getLastSeenAt(): \DateTimeImmutable
    {
        return $this->lastSeenAt;
    }

    public function getExpiresAt(): \DateTimeImmutable
    {
        return $this->expiresAt;
    }

    public function extend(\DateTimeImmutable $now, \DateTimeImmutable $expiresAt): void
    {
        $this->lastSeenAt = $now;
        $this->expiresAt = $expiresAt;
    }
}
