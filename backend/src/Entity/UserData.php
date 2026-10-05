<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\UserDataRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * Browser data synced for one account, as a JSON object of storage key → raw string value.
 * Writes go through UserDataRepository::save(), which checks the version atomically.
 */
#[ORM\Entity(repositoryClass: UserDataRepository::class, readOnly: true)]
#[ORM\Table(name: 'user_data')]
class UserData
{
    #[ORM\Id]
    #[ORM\OneToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(type: Types::TEXT)]
    private string $data;

    #[ORM\Column(options: ['unsigned' => true])]
    private int $version;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $updatedAt;

    private function __construct(User $user, string $data, int $version, \DateTimeImmutable $updatedAt)
    {
        $this->user = $user;
        $this->data = $data;
        $this->version = $version;
        $this->updatedAt = $updatedAt;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function getData(): string
    {
        return $this->data;
    }

    public function getVersion(): int
    {
        return $this->version;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }
}
