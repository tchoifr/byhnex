<?php

declare(strict_types=1);

namespace App\Api;

/**
 * An error returned to the client as {"error": {"code", "message"}} plus optional extra fields.
 */
final class ApiException extends \RuntimeException
{
    /**
     * @param array<string, mixed> $extra
     */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $extra = [],
    ) {
        parent::__construct($message);
    }
}
