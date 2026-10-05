<?php

declare(strict_types=1);

namespace App\Tests\Support;

/**
 * Transactions shaped exactly like mainnet ones: a real USDC transferChecked + memo transaction
 * (tests/Fixtures/solana/mainnet-usdc-transfer-with-memo.json) with the payment's own values put in.
 */
final class SolanaTx
{
    public const FIXTURE_SIGNATURE = '3N3t3b7MtotnqQum8zppDWanrm7FvWwJLtfPVV5XhErLJekRScc3nvXCMvjXe6YFApmvqJY33L2EAJPEvrSv6twd';
    public const FIXTURE_SENDER = 'GkRNvZURAUAaw2skoXThmbydufAMm8HoTG9ZmLUraAJS';
    public const FIXTURE_RECIPIENT = '41zCUJsKk6cMB94DDtm99qWmyMZfp4GkAhhuz4xTwePu';
    public const FIXTURE_REFERENCE = '9GJVrER6TNmyD2kVyREFRMdz1ArK27Tz6iJxUFWwBQzd';
    public const FIXTURE_MEMO = '{"type":"coinflow","ref":"41156737-4191-453c-a3a6-6773a1f57b3c"}';
    public const FIXTURE_AMOUNT = 995470000;
    public const FIXTURE_BLOCK_TIME = 1791221720;
    public const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    /**
     * @return array<mixed>
     */
    public static function fixture(): array
    {
        $tx = json_decode((string) file_get_contents(__DIR__.'/../Fixtures/solana/mainnet-usdc-transfer-with-memo.json'), true, 512, \JSON_THROW_ON_ERROR);
        if (!\is_array($tx)) {
            throw new \UnexpectedValueException('Transaction de test illisible.');
        }

        return $tx;
    }

    /**
     * @return array<mixed>
     */
    public static function payment(string $signature, string $payer, int $amountAtomic, string $memo, string $reference, int $blockTime): array
    {
        $tx = self::fixture();
        $tx['transaction']['signatures'][0] = $signature;
        $tx['transaction']['message']['accountKeys'][0]['pubkey'] = $payer;
        $tx['transaction']['message']['accountKeys'][4]['pubkey'] = $reference;
        $tx['transaction']['message']['instructions'][0]['parsed']['info']['nonceAccount'] = $reference;
        $transfer = &$tx['transaction']['message']['instructions'][2]['parsed']['info'];
        $transfer['authority'] = $payer;
        $transfer['tokenAmount']['amount'] = (string) $amountAtomic;
        unset($transfer);
        $tx['transaction']['message']['instructions'][3]['parsed'] = $memo;
        foreach (['preTokenBalances', 'postTokenBalances'] as $field) {
            $tx['meta'][$field][0]['owner'] = $payer;
        }
        $tx['meta']['postTokenBalances'][0]['uiTokenAmount']['amount'] = (string) ((int) $tx['meta']['preTokenBalances'][0]['uiTokenAmount']['amount'] - $amountAtomic);
        $tx['meta']['postTokenBalances'][1]['uiTokenAmount']['amount'] = (string) ((int) $tx['meta']['preTokenBalances'][1]['uiTokenAmount']['amount'] + $amountAtomic);
        $tx['blockTime'] = $blockTime;

        return $tx;
    }
}
