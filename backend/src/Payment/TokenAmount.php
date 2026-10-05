<?php

declare(strict_types=1);

namespace App\Payment;

/**
 * Token amounts in atomic units (USDC: 6 decimals) as plain integers: every real amount fits in 64 bits
 * (all the USDC in existence is far below 10^18 units), so no floating point and no bcmath extension is needed.
 */
final class TokenAmount
{
    public const MAX_DIGITS = 18;

    /** Amount as written by the RPC ("995470000"); null when it is not a plain integer that fits. */
    public static function parse(mixed $value): ?int
    {
        return \is_string($value) && ctype_digit($value) && \strlen($value) <= self::MAX_DIGITS ? (int) $value : null;
    }

    /** "1.00" → 1000000 with 6 decimals. */
    public static function fromDecimal(string $amount, int $decimals): int
    {
        if (!preg_match('/^(\d{1,12})(?:\.(\d+))?$/', $amount, $m) || \strlen($m[2] ?? '') > $decimals) {
            throw new \InvalidArgumentException('Montant invalide : '.$amount);
        }

        return (int) ($m[1].str_pad($m[2] ?? '', $decimals, '0'));
    }

    /** 1000000 → "1.00" with 6 decimals: trailing zeros removed, at least $minDecimals kept. */
    public static function toDecimal(int $atomic, int $decimals, int $minDecimals = 2): string
    {
        $unit = 10 ** $decimals;
        $fraction = rtrim(str_pad((string) ($atomic % $unit), $decimals, '0', \STR_PAD_LEFT), '0');

        return intdiv($atomic, $unit).'.'.str_pad($fraction, $minDecimals, '0');
    }
}
