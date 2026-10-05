<?php

declare(strict_types=1);

namespace App\Security;

use App\Repository\AuthSessionRepository;
use Psr\Clock\ClockInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;

/**
 * Authenticates requests carrying a valid session cookie. Requests without one continue anonymously;
 * routes that need an account reject them through ApiEntryPoint.
 */
final class SessionTokenAuthenticator extends AbstractAuthenticator
{
    public function __construct(
        private readonly AuthSessionRepository $sessions,
        private readonly SessionManager $manager,
        private readonly ClockInterface $clock,
    ) {
    }

    public function supports(Request $request): bool
    {
        return SessionManager::isWellFormed($request->cookies->get(SessionManager::COOKIE));
    }

    public function authenticate(Request $request): Passport
    {
        $token = (string) $request->cookies->get(SessionManager::COOKIE);
        $session = $this->sessions->findValid(SessionManager::hash($token), $this->clock->now());
        if (null === $session) {
            throw new CustomUserMessageAuthenticationException('Session expirée.');
        }
        $request->attributes->set(SessionManager::ATTRIBUTE, $session);
        if ($cookie = $this->manager->refresh($session, $token)) {
            $request->attributes->set(SessionManager::COOKIE_ATTRIBUTE, $cookie);
        }
        $user = $session->getUser();

        return new SelfValidatingPassport(new UserBadge($user->getUserIdentifier(), static fn () => $user));
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        return null;
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): ?Response
    {
        return null;
    }
}
