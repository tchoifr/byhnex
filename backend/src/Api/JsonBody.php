<?php

declare(strict_types=1);

namespace App\Api;

use Symfony\Component\HttpFoundation\Request;

/**
 * Reads a JSON object from the request body with the API's size and format rules.
 */
final class JsonBody
{
    public const MAX_BYTES = 3_000_000;

    /**
     * @return array<mixed>
     */
    public static function read(Request $request): array
    {
        $type = strtolower((string) $request->headers->get('Content-Type', ''));
        if (!str_starts_with($type, 'application/json')) {
            throw new ApiException(415, 'json_required', 'Envoyez les données au format JSON.');
        }
        $raw = $request->getContent();
        if (\strlen($raw) > self::MAX_BYTES) {
            throw new ApiException(413, 'too_large', 'Les données envoyées sont trop volumineuses.');
        }
        $data = json_decode('' === $raw ? '{}' : $raw, true);
        if (!\is_array($data)) {
            throw new ApiException(400, 'invalid_json', 'Le JSON envoyé est invalide.');
        }

        return $data;
    }
}
