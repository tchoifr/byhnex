<?php

declare(strict_types=1);

namespace App\Tests\Support;

use App\Payment\PaymentConfig;
use App\Payment\RpcUnavailable;
use App\Payment\SolanaRpcClient;

/**
 * Test-only replacement of the Solana RPC (config/services.yaml, when@test): answers from in-memory state.
 */
final class FakeSolanaRpc extends SolanaRpcClient
{
    public static bool $down = false;
    public static string $genesis = PaymentConfig::GENESIS['mainnet-beta'];
    public static string $usdc = '5000000';
    public static int $lamports = 10_000_000;
    /** @var array<string, array<string, mixed>> signature => transaction */
    public static array $finalized = [];
    /** @var array<string, array<string, mixed>> signature => transaction, seen but not finalized */
    public static array $confirmed = [];
    /** @var list<string> */
    public static array $calls = [];

    public static function reset(): void
    {
        self::$down = false;
        self::$genesis = PaymentConfig::GENESIS['mainnet-beta'];
        self::$usdc = '5000000';
        self::$lamports = 10_000_000;
        self::$finalized = [];
        self::$confirmed = [];
        self::$calls = [];
    }

    protected function call(string $method, array $params): mixed
    {
        self::$calls[] = $method;
        if (self::$down) {
            throw new RpcUnavailable('RPC de test indisponible');
        }

        return match ($method) {
            'getGenesisHash' => self::$genesis,
            'getTransaction' => 'finalized' === $params[1]['commitment']
                ? (self::$finalized[$params[0]] ?? null)
                : (self::$finalized[$params[0]] ?? self::$confirmed[$params[0]] ?? null),
            'getSignaturesForAddress' => $this->mentioning((string) $params[0]),
            'getLatestBlockhash' => ['context' => ['slot' => 1], 'value' => ['blockhash' => 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N', 'lastValidBlockHeight' => 300]],
            'getBalance' => ['context' => ['slot' => 1], 'value' => self::$lamports],
            'getTokenAccountsByOwner' => ['context' => ['slot' => 1], 'value' => [['account' => ['data' => ['parsed' => ['info' => ['tokenAmount' => ['amount' => self::$usdc]]]]]]]],
            default => throw new \LogicException('Méthode RPC non simulée : '.$method),
        };
    }

    /**
     * @return list<array{signature: string, err: mixed}>
     */
    private function mentioning(string $address): array
    {
        $out = [];
        foreach (self::$finalized + self::$confirmed as $signature => $tx) {
            foreach ($tx['transaction']['message']['accountKeys'] as $key) {
                if ($key['pubkey'] === $address) {
                    $out[] = ['signature' => $signature, 'err' => $tx['meta']['err']];
                }
            }
        }

        return $out;
    }
}
