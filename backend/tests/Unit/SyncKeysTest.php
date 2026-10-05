<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Api\ApiException;
use App\Sync\SyncKeys;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SyncKeysTest extends TestCase
{
    public function testEncodesKnownKeysAsAnObject(): void
    {
        self::assertSame('{"cryptonite-v1":"{\"a\":1}","byhnex-devise":null}', SyncKeys::encode(['cryptonite-v1' => '{"a":1}', 'byhnex-devise' => null]));
        self::assertSame('{}', SyncKeys::encode([]));
    }

    /**
     * @return iterable<string, array{mixed, string}>
     */
    public static function invalidPayloads(): iterable
    {
        yield 'missing' => [null, 'invalid_data'];
        yield 'list' => [['a', 'b'], 'invalid_data'];
        yield 'unknown key' => [['byhnex-bot-code-v1' => 'secret'], 'unknown_key'];
        yield 'number value' => [['byhnex-devise' => 12], 'invalid_value'];
        yield 'too large' => [['cryptonite-v1' => str_repeat('x', SyncKeys::MAX_BYTES)], 'too_large'];
    }

    #[DataProvider('invalidPayloads')]
    public function testRejectsInvalidPayloads(mixed $data, string $code): void
    {
        try {
            SyncKeys::encode($data);
            self::fail('Exception attendue');
        } catch (ApiException $e) {
            self::assertSame($code, $e->errorCode);
        }
    }

    public function testKeysMatchTheFrontend(): void
    {
        $frontend = (string) file_get_contents(\dirname(__DIR__, 3).'/frontend/src/account/sync-core.ts');
        preg_match('/SYNC_KEYS = \[(.*?)\]/s', $frontend, $m);
        preg_match_all("/'([^']+)'/", $m[1] ?? '', $keys);
        self::assertSame(SyncKeys::KEYS, $keys[1], 'SyncKeys::KEYS et SYNC_KEYS du front doivent rester identiques.');
    }
}
