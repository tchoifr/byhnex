<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Payment\ExpectedPayment;
use App\Payment\PaymentError;
use App\Payment\SolanaTransactionVerifier;
use App\Tests\Support\SolanaTx;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Runs on a real mainnet transaction (USDC transferChecked + memo) and on copies altered one field at a time.
 */
final class SolanaTransactionVerifierTest extends TestCase
{
    public function testAcceptsTheRealMainnetTransfer(): void
    {
        $verified = (new SolanaTransactionVerifier())->verify(SolanaTx::fixture(), self::expected());

        self::assertSame(SolanaTx::FIXTURE_SIGNATURE, $verified->signature);
        self::assertSame(SolanaTx::FIXTURE_SENDER, $verified->payer);
        self::assertSame(SolanaTx::FIXTURE_AMOUNT, $verified->amountAtomic);
        self::assertSame(453647836, $verified->slot);
        self::assertSame(SolanaTx::FIXTURE_BLOCK_TIME, $verified->blockTime->getTimestamp());
    }

    public function testAcceptsAnyPayerForAQrCodePayment(): void
    {
        $verified = (new SolanaTransactionVerifier())->verify(SolanaTx::fixture(), self::expected(payer: null));

        self::assertSame(SolanaTx::FIXTURE_SENDER, $verified->payer);
    }

    /**
     * @return iterable<string, array{\Closure(array<mixed>): array<mixed>, array<string, mixed>, string}>
     */
    public static function refusals(): iterable
    {
        $same = static fn (array $tx): array => $tx;
        yield 'montant inférieur' => [$same, ['amount' => 995469999], 'INVALID_AMOUNT'];
        yield 'montant supérieur' => [$same, ['amount' => 1000000], 'INVALID_AMOUNT'];
        yield 'autre token' => [$same, ['mint' => 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'], 'INVALID_TOKEN'];
        yield 'autre destinataire' => [$same, ['recipient' => 'BSFhKkzSVUoxTDBGMfu9j4WwsPZpbHZbmCcPcghWMp87'], 'INVALID_RECIPIENT'];
        yield 'autre memo' => [$same, ['memo' => 'SUB_00000000-0000-4000-8000-000000000000'], 'INVALID_MEMO'];
        yield 'référence absente' => [$same, ['reference' => 'BSFhKkzSVUoxTDBGMfu9j4WwsPZpbHZbmCcPcghWMp87'], 'INVALID_MEMO'];
        yield 'référence signataire' => [$same, ['reference' => SolanaTx::FIXTURE_SENDER], 'INVALID_MEMO'];
        yield 'autre wallet' => [$same, ['payer' => 'BSFhKkzSVUoxTDBGMfu9j4WwsPZpbHZbmCcPcghWMp87'], 'INVALID_SENDER'];
        yield 'autre signature' => [$same, ['signature' => '2RXNGe4HNrzRDtwfXBChZvQznKwZ7dj34AVqSbDWJE2eKrLFzsLvcR7J8x33hdtk5femgwEGoZXsr2Ny4rmM13dT'], 'INVALID_SIGNATURE'];
        yield 'demande expirée' => [$same, ['expiresAt' => (new \DateTimeImmutable('@'.SolanaTx::FIXTURE_BLOCK_TIME))->modify('-121 seconds')], 'PAYMENT_INTENT_EXPIRED'];

        yield 'transaction échouée' => [static function (array $tx): array {
            $tx['meta']['err'] = ['InstructionError' => [2, ['Custom' => 1]]];

            return $tx;
        }, [], 'TRANSACTION_FAILED'];
        yield 'transfert signé par un tiers' => [static function (array $tx): array {
            $tx['transaction']['message']['accountKeys'][0]['signer'] = false;

            return $tx;
        }, [], 'INVALID_SENDER'];
        yield 'transfert non vérifié (sans mint) vers un autre token' => [static function (array $tx): array {
            $ix = &$tx['transaction']['message']['instructions'][2]['parsed'];
            $ix['type'] = 'transfer';
            $ix['info']['amount'] = $ix['info']['tokenAmount']['amount'];
            unset($ix['info']['mint'], $ix['info']['tokenAmount'], $ix);
            foreach (['preTokenBalances', 'postTokenBalances'] as $field) {
                $tx['meta'][$field][1]['mint'] = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
            }

            return $tx;
        }, [], 'INVALID_TOKEN'];
        yield 'solde final incohérent' => [static function (array $tx): array {
            $tx['meta']['postTokenBalances'][1]['uiTokenAmount']['amount'] = '19159230000';

            return $tx;
        }, [], 'INVALID_AMOUNT'];
        yield 'transfert via un autre programme' => [static function (array $tx): array {
            $tx['transaction']['message']['instructions'][2]['programId'] = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

            return $tx;
        }, [], 'INVALID_RECIPIENT'];
        yield 'non daté' => [static function (array $tx): array {
            $tx['blockTime'] = null;

            return $tx;
        }, [], 'TRANSACTION_PENDING'];
    }

    /**
     * @param \Closure(array<mixed>): array<mixed> $mutate
     * @param array<string, mixed>                 $expected
     */
    #[DataProvider('refusals')]
    public function testRefuses(\Closure $mutate, array $expected, string $code): void
    {
        try {
            (new SolanaTransactionVerifier())->verify($mutate(SolanaTx::fixture()), self::expected(...$expected));
            self::fail('Transaction acceptée à tort.');
        } catch (PaymentError $e) {
            self::assertSame($code, $e->errorCode);
        }
    }

    public function testInnerInstructionsCount(): void
    {
        $tx = SolanaTx::fixture();
        $transfer = $tx['transaction']['message']['instructions'][2];
        $tx['transaction']['message']['instructions'][2] = ['programId' => 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', 'accounts' => [], 'data' => ''];
        $tx['meta']['innerInstructions'] = [['index' => 2, 'instructions' => [$transfer]]];

        self::assertSame(SolanaTx::FIXTURE_SENDER, (new SolanaTransactionVerifier())->verify($tx, self::expected())->payer);
    }

    private static function expected(
        string $signature = SolanaTx::FIXTURE_SIGNATURE,
        ?string $payer = SolanaTx::FIXTURE_SENDER,
        string $recipient = SolanaTx::FIXTURE_RECIPIENT,
        string $mint = SolanaTx::USDC,
        int $amount = SolanaTx::FIXTURE_AMOUNT,
        string $memo = SolanaTx::FIXTURE_MEMO,
        string $reference = SolanaTx::FIXTURE_REFERENCE,
        ?\DateTimeImmutable $expiresAt = null,
    ): ExpectedPayment {
        $sent = new \DateTimeImmutable('@'.SolanaTx::FIXTURE_BLOCK_TIME);

        return new ExpectedPayment($signature, $payer, $recipient, $mint, $amount, $memo, $reference, $sent->modify('-5 minutes'), $expiresAt ?? $sent->modify('+10 minutes'));
    }
}
