<?php

declare(strict_types=1);

namespace App\Account;

use App\Api\ApiException;

/**
 * Validation rules for e-mail addresses and passwords.
 */
final class Credentials
{
    public const MIN_PASSWORD = 10;
    public const MAX_PASSWORD = 256;

    /**
     * @return non-empty-string
     */
    public static function email(mixed $email): string
    {
        $email = strtolower(trim(\is_scalar($email) ? (string) $email : ''));
        if ('' === $email || \strlen($email) > 254 || false === filter_var($email, \FILTER_VALIDATE_EMAIL)) {
            throw new ApiException(422, 'invalid_email', 'Adresse e-mail invalide.');
        }

        return $email;
    }

    public static function newPassword(mixed $password): string
    {
        $password = \is_scalar($password) ? (string) $password : '';
        $length = mb_strlen($password);
        if ($length < self::MIN_PASSWORD || $length > self::MAX_PASSWORD) {
            throw new ApiException(422, 'weak_password', 'Le mot de passe doit contenir entre 10 et 256 caractères.');
        }

        return $password;
    }

    public static function given(mixed $password): string
    {
        return \is_scalar($password) ? (string) $password : '';
    }
}
