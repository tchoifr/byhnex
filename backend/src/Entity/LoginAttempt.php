<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\LoginAttemptRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * One registration or failed login, used to throttle by IP and by e-mail address.
 */
#[ORM\Entity(repositoryClass: LoginAttemptRepository::class)]
#[ORM\Table(name: 'login_attempts')]
#[ORM\Index(name: 'attempts_ip', columns: ['ip', 'kind', 'attempted_at'])]
#[ORM\Index(name: 'attempts_email', columns: ['email', 'kind', 'attempted_at'])]
class LoginAttempt
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT, options: ['unsigned' => true])]
    private int|string|null $id = null;

    #[ORM\Column(length: 45)]
    private string $ip;

    #[ORM\Column(length: 254)]
    private string $email;

    #[ORM\Column(length: 16)]
    private string $kind;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $attemptedAt;

    public function __construct(string $ip, string $email, string $kind, \DateTimeImmutable $attemptedAt)
    {
        $this->ip = mb_substr($ip, 0, 45);
        $this->email = $email;
        $this->kind = $kind;
        $this->attemptedAt = $attemptedAt;
    }

    public function getId(): int|string|null
    {
        return $this->id;
    }
}
