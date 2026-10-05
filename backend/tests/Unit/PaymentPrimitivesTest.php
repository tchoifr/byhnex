<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Bot\BotAccessToken;
use App\Payment\Base58;
use App\Payment\TokenAmount;
use PHPUnit\Framework\TestCase;

final class PaymentPrimitivesTest extends TestCase
{
    public function testBase58RoundTripsSolanaKeys(): void
    {
        $mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        self::assertSame(32, \strlen((string) Base58::decode($mint)));
        self::assertSame($mint, Base58::encode((string) Base58::decode($mint)));
        self::assertSame('11111111111111111111111111111111', Base58::encode(str_repeat("\0", 32)));
        self::assertTrue(Base58::isPublicKey($mint));
        self::assertFalse(Base58::isPublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt10'), 'Le 0 n’existe pas en Base58.');
        self::assertFalse(Base58::isPublicKey('abc'));
        self::assertFalse(Base58::isPublicKey(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']));
        self::assertTrue(Base58::isSignature('3N3t3b7MtotnqQum8zppDWanrm7FvWwJLtfPVV5XhErLJekRScc3nvXCMvjXe6YFApmvqJY33L2EAJPEvrSv6twd'));
        self::assertFalse(Base58::isSignature($mint));
    }

    public function testPricesAreConvertedWithoutFloatingPoint(): void
    {
        self::assertSame(1000000, TokenAmount::fromDecimal('1.00', 6));
        self::assertSame(1000000, TokenAmount::fromDecimal('1', 6));
        self::assertSame(100000, TokenAmount::fromDecimal('0.1', 6));
        self::assertSame(123456789, TokenAmount::fromDecimal('123.456789', 6));
        self::assertSame('1.00', TokenAmount::toDecimal(1000000, 6));
        self::assertSame('1.000000', TokenAmount::toDecimal(1000000, 6, 6));
        self::assertSame('0.05', TokenAmount::toDecimal(50000, 6));
        self::assertSame('995.47', TokenAmount::toDecimal(995470000, 6));
        self::assertSame('1.', TokenAmount::toDecimal(1000000, 6, 0));
        self::assertSame(995470000, TokenAmount::parse('995470000'));
        self::assertNull(TokenAmount::parse('9999999999999999999'), 'Au-delà de 64 bits.');
        self::assertNull(TokenAmount::parse('-1'));
        self::assertNull(TokenAmount::parse(12));
        $this->expectException(\InvalidArgumentException::class);
        TokenAmount::fromDecimal('1.0000001', 6);
    }

    public function testBotTokensAreSignedAndSurviveTheBotPageNormalization(): void
    {
        $keys = sodium_crypto_sign_keypair();
        $signer = new BotAccessToken(bin2hex(sodium_crypto_sign_secretkey($keys)), 'https://bot.example');
        $token = $signer->issue(42, new \DateTimeImmutable('@1800000000'));

        self::assertMatchesRegularExpression('/^[A-Z2-7]{130}$/', $token);
        $raw = self::base32Decode($token);
        self::assertSame(81, \strlen($raw));
        [$payload, $signature] = [substr($raw, 0, 17), substr($raw, 17)];
        if ('' === $signature) {
            self::fail('Signature absente.');
        }
        self::assertTrue(sodium_crypto_sign_verify_detached($signature, $payload, sodium_crypto_sign_publickey($keys)));
        self::assertSame(['v' => 1, 'user' => 42, 'until' => 1800000000], unpack('Cv/Juser/Juntil', $payload));
        self::assertSame($token, $signer->issue(42, new \DateTimeImmutable('@1800000000')), 'Même abonnement, même code.');
        self::assertFalse((new BotAccessToken('', ''))->isConfigured());
    }

    private static function base32Decode(string $text): string
    {
        $bits = '';
        foreach (str_split($text) as $char) {
            $bits .= str_pad(decbin((int) strpos('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', $char)), 5, '0', \STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split(substr($bits, 0, intdiv(\strlen($bits), 8) * 8), 8) as $byte) {
            $out .= \chr((int) bindec($byte));
        }

        return $out;
    }
}
