<?php

declare(strict_types=1);

namespace App\Payment;

/**
 * Checks that a transaction returned by getTransaction (encoding jsonParsed) pays a payment request exactly.
 * Pure: no network, no database. Throws PaymentError with the first rule that fails.
 */
final class SolanaTransactionVerifier
{
    public const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    public const MEMO_PROGRAMS = ['MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo'];

    /**
     * @param array<mixed> $tx the "result" of getTransaction
     */
    public function verify(array $tx, ExpectedPayment $expected): VerifiedPayment
    {
        $message = self::arr(self::arr($tx['transaction'] ?? null)['message'] ?? null);
        $signatures = self::arr(self::arr($tx['transaction'] ?? null)['signatures'] ?? null);
        if (($signatures[0] ?? null) !== $expected->signature) {
            throw new PaymentError('INVALID_SIGNATURE');
        }
        $meta = self::arr($tx['meta'] ?? null);
        if ([] === $meta || null !== ($meta['err'] ?? null)) {
            throw new PaymentError('TRANSACTION_FAILED');
        }
        if (!\is_int($tx['blockTime'] ?? null) || !\is_int($tx['slot'] ?? null)) {
            throw new PaymentError('TRANSACTION_PENDING');
        }
        $blockTime = (new \DateTimeImmutable('@'.$tx['blockTime']))->setTimezone(new \DateTimeZone('UTC'));
        if ($blockTime > $expected->expiresAt->modify(sprintf('+%d seconds', PaymentConfig::EXPIRY_GRACE_SECONDS))) {
            throw new PaymentError('PAYMENT_INTENT_EXPIRED');
        }

        $keys = self::accountKeys($message);
        $tokenAccounts = self::tokenAccounts($meta, $keys);
        $instructions = self::instructions($message, $meta);

        $payer = $this->checkTransfers($instructions, $tokenAccounts, $keys, $expected);
        $this->checkBalanceDelta($meta, $keys, $expected);
        $this->checkMemoAndReference($instructions, $keys, $expected);

        return new VerifiedPayment($expected->signature, $payer, $expected->amountAtomic, $tx['slot'], $blockTime);
    }

    /**
     * @param list<array<mixed>>                                $instructions
     * @param array<string, array{mint: string, owner: string}> $tokenAccounts
     * @param array<string, bool>                               $keys          address => signer
     */
    private function checkTransfers(array $instructions, array $tokenAccounts, array $keys, ExpectedPayment $expected): string
    {
        $toPlatform = 0;
        $total = 0;
        $authorities = [];
        foreach ($instructions as $ix) {
            if (self::TOKEN_PROGRAM !== ($ix['programId'] ?? null)) {
                continue;
            }
            $parsed = self::arr($ix['parsed'] ?? null);
            $type = $parsed['type'] ?? null;
            if ('transfer' !== $type && 'transferChecked' !== $type) {
                continue;
            }
            $info = self::arr($parsed['info'] ?? null);
            $destination = $tokenAccounts[(string) ($info['destination'] ?? '')] ?? null;
            if (null === $destination || $destination['owner'] !== $expected->recipient) {
                continue;
            }
            ++$toPlatform;
            $mint = 'transferChecked' === $type ? ($info['mint'] ?? null) : $destination['mint'];
            if ($mint !== $expected->mint || $destination['mint'] !== $expected->mint) {
                continue;
            }
            $amount = TokenAmount::parse('transferChecked' === $type ? (self::arr($info['tokenAmount'] ?? null)['amount'] ?? null) : ($info['amount'] ?? null));
            if (null === $amount) {
                throw new PaymentError('INVALID_AMOUNT');
            }
            $total += $amount;
            $authorities[] = $info['authority'] ?? null;
        }
        if (0 === $toPlatform) {
            throw new PaymentError('INVALID_RECIPIENT');
        }
        if ([] === $authorities) {
            throw new PaymentError('INVALID_TOKEN');
        }
        if ($total !== $expected->amountAtomic) {
            throw new PaymentError('INVALID_AMOUNT');
        }
        $payer = $authorities[0];
        foreach ($authorities as $authority) {
            // The owner itself must sign (no multisig, no third party), and match the connected wallet when one was given.
            if (!\is_string($authority) || $authority !== $payer || true !== ($keys[$authority] ?? false)
                || (null !== $expected->payer && $authority !== $expected->payer)) {
                throw new PaymentError('INVALID_SENDER');
            }
        }

        return $payer;
    }

    /**
     * The platform's USDC balance must grow by exactly the price: guards against anything the parsed instructions hide.
     *
     * @param array<mixed>        $meta
     * @param array<string, bool> $keys
     */
    private function checkBalanceDelta(array $meta, array $keys, ExpectedPayment $expected): void
    {
        $sum = function (string $field) use ($meta, $keys, $expected): int {
            $total = 0;
            $addresses = array_keys($keys);
            foreach (self::arr($meta[$field] ?? null) as $balance) {
                $balance = self::arr($balance);
                $index = $balance['accountIndex'] ?? null;
                if (!\is_int($index) || !isset($addresses[$index])
                    || ($balance['mint'] ?? null) !== $expected->mint || ($balance['owner'] ?? null) !== $expected->recipient) {
                    continue;
                }
                $amount = TokenAmount::parse(self::arr($balance['uiTokenAmount'] ?? null)['amount'] ?? null);
                if (null === $amount) {
                    throw new PaymentError('INVALID_AMOUNT');
                }
                $total += $amount;
            }

            return $total;
        };
        if ($sum('postTokenBalances') - $sum('preTokenBalances') !== $expected->amountAtomic) {
            throw new PaymentError('INVALID_AMOUNT');
        }
    }

    /**
     * @param list<array<mixed>>  $instructions
     * @param array<string, bool> $keys
     */
    private function checkMemoAndReference(array $instructions, array $keys, ExpectedPayment $expected): void
    {
        $memos = [];
        foreach ($instructions as $ix) {
            if (\in_array($ix['programId'] ?? null, self::MEMO_PROGRAMS, true) && \is_string($ix['parsed'] ?? null)) {
                $memos[] = $ix['parsed'];
            }
        }
        if (!\in_array($expected->memo, $memos, true)) {
            throw new PaymentError('INVALID_MEMO');
        }
        if (false !== ($keys[$expected->reference] ?? true)) {
            throw new PaymentError('INVALID_MEMO');
        }
    }

    /**
     * @param array<mixed> $message
     *
     * @return array<string, bool> address => signer, in the transaction's account order (loaded addresses included)
     */
    private static function accountKeys(array $message): array
    {
        $keys = [];
        foreach (self::arr($message['accountKeys'] ?? null) as $key) {
            if (\is_array($key) && \is_string($key['pubkey'] ?? null)) {
                $keys[$key['pubkey']] = true === ($key['signer'] ?? false);
            }
        }

        return $keys;
    }

    /**
     * @param array<mixed>        $meta
     * @param array<string, bool> $keys
     *
     * @return array<string, array{mint: string, owner: string}> token account => mint and owner wallet
     */
    private static function tokenAccounts(array $meta, array $keys): array
    {
        $addresses = array_keys($keys);
        $accounts = [];
        foreach (['preTokenBalances', 'postTokenBalances'] as $field) {
            foreach (self::arr($meta[$field] ?? null) as $balance) {
                $balance = self::arr($balance);
                $index = $balance['accountIndex'] ?? null;
                if (\is_int($index) && isset($addresses[$index]) && \is_string($balance['mint'] ?? null) && \is_string($balance['owner'] ?? null)
                    && self::TOKEN_PROGRAM === ($balance['programId'] ?? self::TOKEN_PROGRAM)) {
                    $accounts[$addresses[$index]] = ['mint' => $balance['mint'], 'owner' => $balance['owner']];
                }
            }
        }

        return $accounts;
    }

    /**
     * Top-level and inner instructions (a wallet or a program may wrap the transfer).
     *
     * @param array<mixed> $message
     * @param array<mixed> $meta
     *
     * @return list<array<mixed>>
     */
    private static function instructions(array $message, array $meta): array
    {
        $all = [];
        foreach (self::arr($message['instructions'] ?? null) as $ix) {
            $all[] = self::arr($ix);
        }
        foreach (self::arr($meta['innerInstructions'] ?? null) as $group) {
            foreach (self::arr(self::arr($group)['instructions'] ?? null) as $ix) {
                $all[] = self::arr($ix);
            }
        }

        return $all;
    }

    /**
     * @return array<mixed>
     */
    private static function arr(mixed $value): array
    {
        return \is_array($value) ? $value : [];
    }
}
