<?php

declare(strict_types=1);

namespace App\Payment;

/**
 * Bitcoin-alphabet Base58, used by Solana for addresses and transaction signatures.
 */
final class Base58
{
    private const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

    public static function encode(string $bytes): string
    {
        $digits = [0];
        foreach (str_split($bytes) as $char) {
            $carry = \ord($char);
            foreach ($digits as $i => $digit) {
                $carry += $digit << 8;
                $digits[$i] = $carry % 58;
                $carry = intdiv($carry, 58);
            }
            while ($carry > 0) {
                $digits[] = $carry % 58;
                $carry = intdiv($carry, 58);
            }
        }
        $leadingZeros = \strlen($bytes) - \strlen(ltrim($bytes, "\0"));
        $out = str_repeat('1', $leadingZeros);
        if ('' === ltrim($bytes, "\0")) {
            return $out;
        }
        for ($i = \count($digits) - 1; $i >= 0; --$i) {
            $out .= self::ALPHABET[$digits[$i]];
        }

        return $out;
    }

    /**
     * @return string|null raw bytes, or null when the text is not valid Base58
     */
    public static function decode(string $text): ?string
    {
        if ('' === $text || \strlen($text) > 128) {
            return null;
        }
        $bytes = [0];
        foreach (str_split($text) as $char) {
            $value = strpos(self::ALPHABET, $char);
            if (false === $value) {
                return null;
            }
            $carry = $value;
            foreach ($bytes as $i => $byte) {
                $carry += $byte * 58;
                $bytes[$i] = $carry & 0xFF;
                $carry >>= 8;
            }
            while ($carry > 0) {
                $bytes[] = $carry & 0xFF;
                $carry >>= 8;
            }
        }
        $leadingOnes = \strlen($text) - \strlen(ltrim($text, '1'));
        $out = str_repeat("\0", $leadingOnes);
        if ('' === ltrim($text, '1')) {
            return $out;
        }
        for ($i = \count($bytes) - 1; $i >= 0; --$i) {
            $out .= \chr($bytes[$i]);
        }

        return $out;
    }

    /** A Solana public key: Base58 text decoding to exactly 32 bytes. */
    public static function isPublicKey(mixed $value): bool
    {
        return \is_string($value) && \strlen($value) >= 32 && \strlen($value) <= 44 && 32 === \strlen((string) self::decode($value));
    }

    /** A Solana transaction signature: Base58 text decoding to exactly 64 bytes. */
    public static function isSignature(mixed $value): bool
    {
        return \is_string($value) && \strlen($value) >= 64 && \strlen($value) <= 88 && 64 === \strlen((string) self::decode($value));
    }
}
