<?php

declare(strict_types=1);

namespace App\Bot;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Access code for the subscribers' bot server (bot-server/ on Cloudflare): the account id and the end of the
 * subscription, signed with Ed25519. The bot server only holds the public key, so it can check a code but never
 * make one. Base32 (A-Z, 2-7) so the code survives the bot page's normalization (upper case, letters and digits).
 */
final class BotAccessToken
{
    public const VERSION = 1;
    private const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public function __construct(
        #[Autowire('%env(BOT_TOKEN_SECRET_KEY)%')] private readonly string $secretKeyHex,
        #[Autowire('%env(BOT_SERVER_URL)%')] public readonly string $serverUrl,
    ) {
    }

    public function isConfigured(): bool
    {
        return 1 === preg_match('/^[0-9a-f]{128}$/', $this->secretKeyHex) && str_starts_with($this->serverUrl, 'https://');
    }

    public function issue(int|string $userId, \DateTimeImmutable $paidUntil): string
    {
        if (!$this->isConfigured()) {
            throw new \LogicException('BOT_TOKEN_SECRET_KEY et BOT_SERVER_URL sont requis.');
        }
        $payload = pack('CJJ', self::VERSION, (int) $userId, $paidUntil->getTimestamp());
        $secretKey = hex2bin($this->secretKeyHex);
        if (false === $secretKey || '' === $secretKey) {
            throw new \LogicException('BOT_TOKEN_SECRET_KEY invalide.');
        }
        $signature = sodium_crypto_sign_detached($payload, $secretKey);

        return self::base32($payload.$signature);
    }

    public static function base32(string $bytes): string
    {
        $out = '';
        $buffer = 0;
        $bits = 0;
        foreach (str_split($bytes) as $char) {
            $buffer = ($buffer << 8) | \ord($char);
            $bits += 8;
            while ($bits >= 5) {
                $bits -= 5;
                $out .= self::BASE32[($buffer >> $bits) & 31];
            }
            $buffer &= (1 << $bits) - 1;
        }
        if ($bits > 0) {
            $out .= self::BASE32[($buffer << (5 - $bits)) & 31];
        }

        return $out;
    }
}
