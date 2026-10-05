<?php

declare(strict_types=1);

namespace App\Api;

use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * JSON responses in the API's format, unescaped so accented messages stay readable.
 */
final class ApiResponse
{
    /**
     * @param array<string, mixed> $body
     */
    public static function json(array $body, int $status = 200): JsonResponse
    {
        $response = new JsonResponse($body, $status);
        $response->setEncodingOptions(\JSON_UNESCAPED_UNICODE | \JSON_UNESCAPED_SLASHES);

        return $response;
    }

    public static function error(ApiException $e): JsonResponse
    {
        $body = ['error' => ['code' => $e->errorCode, 'message' => $e->getMessage()]];
        if ([] !== $e->extra) {
            $body['server'] = $e->extra;
        }

        return self::json($body, $e->status);
    }
}
