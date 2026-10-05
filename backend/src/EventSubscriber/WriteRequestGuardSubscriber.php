<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use App\Api\ApiException;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Cross-site protection for writes: a custom header (forces a CORS preflight this API never grants)
 * and, when the browser sends one, an Origin from the allowed list.
 * Runs after routing (unknown routes stay 404) and before authentication.
 */
final class WriteRequestGuardSubscriber implements EventSubscriberInterface
{
    /** @var list<string> */
    private readonly array $allowedOrigins;

    public function __construct(#[Autowire('%env(ALLOWED_ORIGINS)%')] string $allowedOrigins)
    {
        $this->allowedOrigins = array_values(array_filter(array_map('trim', explode(',', $allowedOrigins))));
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => ['onRequest', 20]];
    }

    public function onRequest(RequestEvent $event): void
    {
        $request = $event->getRequest();
        if (!$event->isMainRequest() || \in_array($request->getMethod(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        if ('byhnex' !== $request->headers->get('X-Requested-With')) {
            throw new ApiException(403, 'forbidden', 'Requête refusée.');
        }
        $origin = (string) $request->headers->get('Origin', '');
        if ('' !== $origin && !\in_array($origin, $this->allowedOrigins, true)) {
            throw new ApiException(403, 'forbidden_origin', 'Origine non autorisée.');
        }
    }
}
