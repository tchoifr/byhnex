<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Account\Credentials;
use App\Api\ApiException;
use PHPUnit\Framework\TestCase;

final class CredentialsTest extends TestCase
{
    public function testNormalizesEmail(): void
    {
        self::assertSame('anne@example.com', Credentials::email('  Anne@Example.COM '));
    }

    public function testRejectsInvalidEmail(): void
    {
        $this->expectException(ApiException::class);
        Credentials::email(['not', 'a', 'string']);
    }

    public function testPasswordLengthRules(): void
    {
        self::assertSame('dix-caract', Credentials::newPassword('dix-caract'));
        foreach (['court', str_repeat('é', 257)] as $invalid) {
            try {
                Credentials::newPassword($invalid);
                self::fail('Exception attendue pour '.mb_strlen($invalid).' caractères');
            } catch (ApiException $e) {
                self::assertSame('weak_password', $e->errorCode);
            }
        }
    }
}
