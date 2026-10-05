<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\LoginAttempt;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<LoginAttempt>
 */
class LoginAttemptRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, LoginAttempt::class);
    }

    /**
     * @param 'ip'|'email' $field
     */
    public function countSince(string $kind, string $field, string $value, \DateTimeImmutable $since): int
    {
        return (int) $this->createQueryBuilder('a')
            ->select('COUNT(a.id)')
            ->where('a.kind = :kind')
            ->andWhere('a.attemptedAt > :since')
            ->andWhere(sprintf('a.%s = :value', $field))
            ->setParameter('kind', $kind)
            ->setParameter('since', $since, 'datetime_immutable')
            ->setParameter('value', $value)
            ->getQuery()
            ->getSingleScalarResult();
    }

    public function deleteOlderThan(\DateTimeImmutable $limit): void
    {
        $this->createQueryBuilder('a')
            ->delete()
            ->where('a.attemptedAt < :limit')
            ->setParameter('limit', $limit, 'datetime_immutable')
            ->getQuery()
            ->execute();
    }
}
