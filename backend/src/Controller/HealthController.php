<?php

declare(strict_types=1);

namespace App\Controller;

use App\Api\ApiResponse;
use Doctrine\DBAL\Connection;
use Psr\Clock\ClockInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

final class HealthController
{
    #[Route('/health', name: 'health', methods: ['GET'])]
    public function __invoke(Connection $connection, ClockInterface $clock): JsonResponse
    {
        $connection->executeQuery('SELECT 1');

        return ApiResponse::json(['ok' => true, 'database' => 'ok', 'time' => $clock->now()->format(\DATE_ATOM)]);
    }
}
