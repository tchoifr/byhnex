<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\AuthSession;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<AuthSession>
 */
class AuthSessionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, AuthSession::class);
    }

    public function findValid(string $tokenHash, \DateTimeImmutable $now): ?AuthSession
    {
        return $this->createQueryBuilder('s')
            ->addSelect('u')
            ->join('s.user', 'u')
            ->where('s.tokenHash = :hash')
            ->andWhere('s.expiresAt > :now')
            ->setParameter('hash', $tokenHash)
            ->setParameter('now', $now, 'datetime_immutable')
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function deleteOthers(User $user, AuthSession $keep): void
    {
        $this->createQueryBuilder('s')
            ->delete()
            ->where('s.user = :user')
            ->andWhere('s.id <> :keep')
            ->setParameter('user', $user)
            ->setParameter('keep', $keep->getId())
            ->getQuery()
            ->execute();
    }

    public function deleteExpired(\DateTimeImmutable $now): void
    {
        $this->createQueryBuilder('s')
            ->delete()
            ->where('s.expiresAt < :now')
            ->setParameter('now', $now, 'datetime_immutable')
            ->getQuery()
            ->execute();
    }
}
