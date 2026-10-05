<?php

declare(strict_types=1);

namespace App\Sync;

use App\Api\ApiException;

/**
 * Browser storage keys that hold user data. Must match SYNC_KEYS in frontend/src/account/sync-core.ts.
 * Caches, the bot's personal code and the live bot state stay on the device.
 */
final class SyncKeys
{
    public const KEYS = [
        'cryptonite-v1', 'crypto-portfolio-v1', 'byhnex-reserve-eur', 'byhnex-favorites',
        'byhnex-devise', 'byhnex-bot-prefs-v1', 'byhnex-bot-mode-v1',
    ];
    public const MAX_BYTES = 2_000_000;

    /**
     * Checks the "data" object sent by a device and returns it as JSON.
     */
    public static function encode(mixed $data): string
    {
        if (!\is_array($data) || ([] !== $data && array_is_list($data))) {
            throw new ApiException(422, 'invalid_data', 'Les données doivent être un objet.');
        }
        foreach ($data as $key => $value) {
            if (!\in_array($key, self::KEYS, true)) {
                throw new ApiException(422, 'unknown_key', 'Clé non synchronisable : '.$key);
            }
            if (null !== $value && !\is_string($value)) {
                throw new ApiException(422, 'invalid_value', 'Valeur invalide pour '.$key);
            }
        }
        $json = json_encode((object) $data, \JSON_UNESCAPED_UNICODE | \JSON_UNESCAPED_SLASHES | \JSON_THROW_ON_ERROR);
        if (\strlen($json) > self::MAX_BYTES) {
            throw new ApiException(413, 'too_large', 'Les données dépassent 2 Mo.');
        }

        return $json;
    }
}
