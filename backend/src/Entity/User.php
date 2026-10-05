<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'users')]
#[ORM\UniqueConstraint(name: 'users_email', columns: ['email'])]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT, options: ['unsigned' => true])]
    private int|string|null $id = null;

    #[ORM\Column(length: 254)]
    private string $email;

    #[ORM\Column(length: 255)]
    private string $passwordHash = '';

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $lastLoginAt = null;

    /**
     * @param non-empty-string $email
     */
    public function __construct(string $email, \DateTimeImmutable $createdAt)
    {
        $this->email = $email;
        $this->createdAt = $createdAt;
    }

    public function getId(): int|string|null
    {
        return $this->id;
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getPassword(): string
    {
        return $this->passwordHash;
    }

    public function setPassword(string $hash): void
    {
        $this->passwordHash = $hash;
    }

    public function markLoggedIn(\DateTimeImmutable $at): void
    {
        $this->lastLoginAt = $at;
    }

    public function getLastLoginAt(): ?\DateTimeImmutable
    {
        return $this->lastLoginAt;
    }

    public function getUserIdentifier(): string
    {
        if ('' === $this->email) {
            throw new \LogicException('Un compte a toujours une adresse e-mail.');
        }

        return $this->email;
    }

    public function getRoles(): array
    {
        return ['ROLE_USER'];
    }

    public function eraseCredentials(): void
    {
    }
}
