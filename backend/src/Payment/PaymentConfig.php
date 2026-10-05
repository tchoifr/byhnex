<?php

declare(strict_types=1);

namespace App\Payment;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Subscription price and Solana settings. Everything comes from the server environment, never from the browser.
 */
final class PaymentConfig
{
    /** Genesis hashes of the clusters, to make sure the RPC serves the configured network. */
    public const GENESIS = [
        'mainnet-beta' => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
        'devnet' => 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    ];
    public const USDC_DECIMALS = 6;
    /** A transaction signed just before the payment request expired is still accepted for this long. */
    public const EXPIRY_GRACE_SECONDS = 120;

    public readonly int $priceAtomic;

    public function __construct(
        #[Autowire('%env(SOLANA_NETWORK)%')] public readonly string $network,
        #[Autowire('%env(SOLANA_RPC_URL)%')] public readonly string $rpcUrl,
        #[Autowire('%env(SOLANA_USDC_MINT)%')] public readonly string $usdcMint,
        #[Autowire('%env(PLATFORM_SOLANA_WALLET)%')] public readonly string $platformWallet,
        #[Autowire('%env(SUBSCRIPTION_PRICE_USDC)%')] public readonly string $price,
        #[Autowire('%env(int:SUBSCRIPTION_DURATION_DAYS)%')] public readonly int $durationDays,
        #[Autowire('%env(int:PAYMENT_INTENT_TTL_MINUTES)%')] public readonly int $intentTtlMinutes,
    ) {
        $this->priceAtomic = TokenAmount::fromDecimal($price, self::USDC_DECIMALS);
    }

    public function isConfigured(): bool
    {
        return isset(self::GENESIS[$this->network]) && '' !== $this->rpcUrl
            && Base58::isPublicKey($this->usdcMint) && Base58::isPublicKey($this->platformWallet)
            && $this->priceAtomic > 0;
    }

    public function expectedGenesis(): string
    {
        return self::GENESIS[$this->network] ?? '';
    }

    /** Explorer link, built only from a validated signature. */
    public function explorerUrl(string $signature): string
    {
        return 'https://solscan.io/tx/'.$signature.('mainnet-beta' === $this->network ? '' : '?cluster='.$this->network);
    }
}
