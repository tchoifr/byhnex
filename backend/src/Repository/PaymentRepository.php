<?php

declare(strict_types=1);

namespace App\Repository;

use App\Entity\Payment;
use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<Payment>
 */
class PaymentRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, Payment::class);
    }

    public function findForUser(User $user, string $id): ?Payment
    {
        return $this->findOneBy(['id' => $id, 'user' => $user]);
    }

    /**
     * @return array<int, Payment>
     */
    public function history(User $user, int $limit = 50): array
    {
        return $this->findBy(['user' => $user], ['createdAt' => 'DESC'], $limit);
    }

    /** The newest request still waiting for its transaction, to resume it after a reload. */
    public function findOpen(User $user): ?Payment
    {
        return $this->createQueryBuilder('p')
            ->where('p.user = :user')
            ->andWhere('p.status IN (:open)')
            ->setParameter('user', $user)
            ->setParameter('open', [Payment::PENDING, Payment::PROCESSING])
            ->orderBy('p.createdAt', 'DESC')
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    public function isSignatureUsed(string $signature, Payment $except): bool
    {
        return null !== $this->createQueryBuilder('p')
            ->select('p.id')
            ->where('p.transactionSignature = :signature')
            ->andWhere('p.id <> :id')
            ->setParameter('signature', $signature)
            ->setParameter('id', $except->getId())
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }
}
