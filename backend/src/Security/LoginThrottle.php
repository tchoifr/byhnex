<?php

declare(strict_types=1);

namespace App\Security;

use App\Api\ApiException;
use App\Entity\LoginAttempt;
use App\Repository\AuthSessionRepository;
use App\Repository\LoginAttemptRepository;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Clock\ClockInterface;

/**
 * Limits registrations and failed logins per IP address and per e-mail address.
 */
final class LoginThrottle
{
    public const REGISTER = ['kind' => 'register', 'perIp' => 10, 'perEmail' => 5, 'window' => 3600];
    public const LOGIN = ['kind' => 'login', 'perIp' => 20, 'perEmail' => 8, 'window' => 900];

    public function __construct(
        private readonly LoginAttemptRepository $attempts,
        private readonly AuthSessionRepository $sessions,
        private readonly EntityManagerInterface $em,
        private readonly ClockInterface $clock,
    ) {
    }

    /**
     * @param array{kind: string, perIp: int, perEmail: int, window: int} $rule
     */
    public function check(array $rule, string $ip, string $email): void
    {
        $since = $this->clock->now()->modify(sprintf('-%d seconds', $rule['window']));
        if ($this->attempts->countSince($rule['kind'], 'ip', $ip, $since) >= $rule['perIp']
            || $this->attempts->countSince($rule['kind'], 'email', $email, $since) >= $rule['perEmail']) {
            throw new ApiException(429, 'too_many_attempts', sprintf('Trop de tentatives. Réessayez dans %d minutes.', (int) ceil($rule['window'] / 60)));
        }
    }

    /**
     * @param array{kind: string, perIp: int, perEmail: int, window: int} $rule
     */
    public function record(array $rule, string $ip, string $email): void
    {
        $now = $this->clock->now();
        $this->em->persist(new LoginAttempt($ip, $email, $rule['kind'], $now));
        $this->em->flush();
        // Occasional cleanup keeps both tables small without a scheduled job.
        if (1 === random_int(1, 50)) {
            $this->attempts->deleteOlderThan($now->modify('-1 day'));
            $this->sessions->deleteExpired($now);
        }
    }
}
