<?php

declare(strict_types=1);

namespace App\Payment;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\HttpClient\Exception\ExceptionInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Read-only JSON-RPC calls to Solana, with a timeout, retries and backoff. The RPC URL may contain an API key:
 * it is never logged nor returned.
 */
class SolanaRpcClient
{
    private const ATTEMPTS = 3;
    private const TIMEOUT = 8.0;

    public function __construct(
        private readonly HttpClientInterface $http,
        private readonly PaymentConfig $config,
        private readonly CacheInterface $cache,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * @return array<mixed>|null the transaction, or null when the cluster does not know it at this commitment
     */
    public function getTransaction(string $signature, string $commitment): ?array
    {
        $result = $this->call('getTransaction', [$signature, ['encoding' => 'jsonParsed', 'commitment' => $commitment, 'maxSupportedTransactionVersion' => 0]]);

        return \is_array($result) ? $result : null;
    }

    /**
     * Signatures of the transactions that mention an address (the Solana Pay reference), newest first.
     *
     * @return list<array{signature: string, err: mixed}>
     */
    public function getSignaturesForAddress(string $address, string $commitment): array
    {
        $result = $this->call('getSignaturesForAddress', [$address, ['limit' => 20, 'commitment' => $commitment]]);
        $out = [];
        foreach (\is_array($result) ? $result : [] as $row) {
            if (\is_array($row) && Base58::isSignature($row['signature'] ?? null)) {
                $out[] = ['signature' => (string) $row['signature'], 'err' => $row['err'] ?? null];
            }
        }

        return $out;
    }

    /**
     * @return array{blockhash: string, lastValidBlockHeight: int}
     */
    public function getLatestBlockhash(): array
    {
        $value = $this->value($this->call('getLatestBlockhash', [['commitment' => 'confirmed']]));
        if (!\is_string($value['blockhash'] ?? null) || !\is_int($value['lastValidBlockHeight'] ?? null)) {
            throw new RpcUnavailable('Réponse getLatestBlockhash invalide.');
        }

        return ['blockhash' => $value['blockhash'], 'lastValidBlockHeight' => $value['lastValidBlockHeight']];
    }

    /** Lamports held by a wallet. */
    public function getBalance(string $owner): int
    {
        $value = $this->call('getBalance', [$owner, ['commitment' => 'confirmed']]);
        $value = \is_array($value) ? ($value['value'] ?? null) : null;
        if (!\is_int($value)) {
            throw new RpcUnavailable('Réponse getBalance invalide.');
        }

        return $value;
    }

    /**
     * Sum of a wallet's token accounts for one mint, in atomic units.
     */
    public function getTokenBalance(string $owner, string $mint): int
    {
        $value = $this->call('getTokenAccountsByOwner', [$owner, ['mint' => $mint], ['encoding' => 'jsonParsed', 'commitment' => 'confirmed']]);
        $total = 0;
        foreach ($this->value($value) as $account) {
            $total += TokenAmount::parse($account['account']['data']['parsed']['info']['tokenAmount']['amount'] ?? null) ?? 0;
        }

        return $total;
    }

    /** Genesis hash of the cluster behind the RPC URL, cached for a day. */
    public function getGenesisHash(): string
    {
        return $this->cache->get('solana_genesis_'.hash('sha256', $this->config->rpcUrl), function ($item): string {
            $item->expiresAfter(86400);
            $hash = $this->call('getGenesisHash', []);
            if (!\is_string($hash)) {
                throw new RpcUnavailable('Réponse getGenesisHash invalide.');
            }

            return $hash;
        });
    }

    /**
     * @param list<mixed> $params
     */
    protected function call(string $method, array $params): mixed
    {
        $delay = 400;
        for ($attempt = 1; $attempt <= self::ATTEMPTS; ++$attempt) {
            try {
                $response = $this->http->request('POST', $this->config->rpcUrl, [
                    'json' => ['jsonrpc' => '2.0', 'id' => 1, 'method' => $method, 'params' => $params],
                    'timeout' => self::TIMEOUT,
                    'max_duration' => self::TIMEOUT + 2,
                ]);
                $status = $response->getStatusCode();
                if (429 === $status || $status >= 500) {
                    $retryAfter = (int) ($response->getHeaders(false)['retry-after'][0] ?? 0);
                    $this->logger->warning('RPC Solana indisponible', ['method' => $method, 'status' => $status, 'attempt' => $attempt]);
                    $this->pause($attempt, max($delay, min($retryAfter, 3) * 1000));
                    $delay *= 2;
                    continue;
                }
                $body = $response->toArray(false);
                if (isset($body['error'])) {
                    $this->logger->warning('Erreur RPC Solana', ['method' => $method, 'code' => $body['error']['code'] ?? null]);
                    throw new RpcUnavailable('Erreur RPC '.$method);
                }

                return $body['result'] ?? null;
            } catch (ExceptionInterface $e) {
                $this->logger->warning('RPC Solana injoignable', ['method' => $method, 'attempt' => $attempt, 'error' => $e::class]);
                $this->pause($attempt, $delay);
                $delay *= 2;
            }
        }
        throw new RpcUnavailable('RPC Solana indisponible pour '.$method);
    }

    private function pause(int $attempt, int $milliseconds): void
    {
        if ($attempt < self::ATTEMPTS) {
            usleep($milliseconds * 1000);
        }
    }

    /**
     * @return array<mixed>
     */
    private function value(mixed $result): array
    {
        $value = \is_array($result) ? ($result['value'] ?? null) : null;

        return \is_array($value) ? $value : [];
    }
}
