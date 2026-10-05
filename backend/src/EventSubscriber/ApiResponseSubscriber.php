<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use App\Security\SessionManager;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * API responses are never cached and carry a refreshed session cookie when the session was extended.
 */
final class ApiResponseSubscriber implements EventSubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::RESPONSE => ['onResponse', -10]];
    }

    public function onResponse(ResponseEvent $event): void
    {
        $response = $event->getResponse();
        $response->headers->set('Cache-Control', 'no-store');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $cookie = $event->getRequest()->attributes->get(SessionManager::COOKIE_ATTRIBUTE);
        if ($cookie instanceof Cookie && !$this->hasSessionCookie($event)) {
            $response->headers->setCookie($cookie);
        }
    }

    private function hasSessionCookie(ResponseEvent $event): bool
    {
        foreach ($event->getResponse()->headers->getCookies() as $cookie) {
            if (SessionManager::COOKIE === $cookie->getName()) {
                return true;
            }
        }

        return false;
    }
}
