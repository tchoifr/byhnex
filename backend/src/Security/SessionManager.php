<?php

declare(strict_types=1);

namespace App\Security;

use App\Entity\AuthSession;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Clock\ClockInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Creates, refreshes and revokes device sessions carried by the HttpOnly "byhnex_session" cookie.
 */
final class SessionManager
{
    public const COOKIE = 'byhnex_session';
    public const DAYS = 30;
    /** Sliding expiry is refreshed at most once per hour. */
    public const REFRESH_AFTER = 3600;
    /** Request attribute holding the AuthSession of the current request. */
    public const ATTRIBUTE = '_byhnex_session';
    /** Request attribute holding a cookie to send back with the response. */
    public const COOKIE_ATTRIBUTE = '_byhnex_session_cookie';

    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly ClockInterface $clock,
        #[Autowire('%env(bool:SESSION_COOKIE_SECURE)%')]
        private readonly bool $secureCookie,
    ) {
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function isWellFormed(mixed $token): bool
    {
        return \is_string($token) && 1 === preg_match('/^[a-f0-9]{64}$/', $token);
    }

    public function start(User $user, Request $request, Response $response): void
    {
        $now = $this->clock->now();
        $token = bin2hex(random_bytes(32));
        $expires = $now->modify(sprintf('+%d days', self::DAYS));
        $this->em->persist(new AuthSession($user, self::hash($token), $now, $expires, (string) $request->headers->get('User-Agent', '')));
        $user->markLoggedIn($now);
        $this->em->flush();
        $response->headers->setCookie($this->cookie($token, $expires));
    }

    /**
     * Extends the session when it was last refreshed more than an hour ago; returns the cookie to resend.
     */
    public function refresh(AuthSession $session, string $token): ?Cookie
    {
        $now = $this->clock->now();
        if ($session->getLastSeenAt() > $now->modify(sprintf('-%d seconds', self::REFRESH_AFTER))) {
            return null;
        }
        $expires = $now->modify(sprintf('+%d days', self::DAYS));
        $session->extend($now, $expires);
        $this->em->flush();

        return $this->cookie($token, $expires);
    }

    public function revoke(?AuthSession $session, Response $response): void
    {
        if (null !== $session) {
            $this->em->remove($session);
            $this->em->flush();
        }
        $response->headers->setCookie($this->cookie('', $this->clock->now()->modify('-1 hour')));
    }

    private function cookie(string $value, \DateTimeImmutable $expires): Cookie
    {
        return Cookie::create(self::COOKIE, $value, $expires, '/api', null, $this->secureCookie, true, false, Cookie::SAMESITE_LAX);
    }
}
