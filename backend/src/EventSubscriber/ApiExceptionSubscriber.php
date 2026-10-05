<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use App\Api\ApiException;
use App\Api\ApiResponse;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Every error leaves the API as {"error": {"code", "message"}}. Unexpected errors are logged and
 * returned as a generic 500 without internal details.
 */
final class ApiExceptionSubscriber implements EventSubscriberInterface
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public static function getSubscribedEvents(): array
    {
        // Below the security listener (priority 1), which turns access denials into 401 responses first.
        return [KernelEvents::EXCEPTION => ['onException', 0]];
    }

    public function onException(ExceptionEvent $event): void
    {
        $e = $event->getThrowable();
        if ($e instanceof NotFoundHttpException || $e instanceof MethodNotAllowedHttpException) {
            $e = new ApiException(404, 'not_found', 'Route inconnue.');
        } elseif (!$e instanceof ApiException) {
            $this->logger->error('API error: {class}: {message}', ['class' => $e::class, 'message' => $e->getMessage(), 'exception' => $e]);
            $e = new ApiException(500, 'server_error', 'Erreur du serveur. Réessayez dans un instant.');
        }
        $event->setResponse(ApiResponse::error($e));
    }
}
