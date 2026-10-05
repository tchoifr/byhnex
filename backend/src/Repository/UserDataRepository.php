<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\User;
use App\Entity\UserData;
use App\Sync\VersionConflict;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\DBAL\Types\Types;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<UserData>
 */
class UserDataRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UserData::class);
    }

    public function findForUser(User $user): ?UserData
    {
        return $this->find($user->getId());
    }

    /**
     * Stores a new version only if the stored one still equals $baseVersion (0 when nothing is stored yet).
     * The check and the write happen in one statement, so two devices cannot overwrite each other.
     *
     * @return int the new version
     *
     * @throws VersionConflict
     */
    public function save(User $user, string $json, int $baseVersion, \DateTimeImmutable $now): int
    {
        $connection = $this->getEntityManager()->getConnection();
        $types = ['updatedAt' => Types::DATETIME_IMMUTABLE];
        if (0 === $baseVersion) {
            try {
                $connection->insert('user_data', ['user_id' => $user->getId(), 'data' => $json, 'version' => 1, 'updated_at' => $now], ['updated_at' => Types::DATETIME_IMMUTABLE]);
            } catch (UniqueConstraintViolationException) {
                throw new VersionConflict();
            }

            return 1;
        }
        $updated = $connection->executeStatement(
            'UPDATE user_data SET data = :data, version = version + 1, updated_at = :updatedAt WHERE user_id = :user AND version = :base',
            ['data' => $json, 'updatedAt' => $now, 'user' => $user->getId(), 'base' => $baseVersion],
            $types,
        );
        if (1 !== $updated) {
            throw new VersionConflict();
        }

        return $baseVersion + 1;
    }
}
