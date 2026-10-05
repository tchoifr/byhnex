<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Payment\Base58;
use App\Tests\Support\FakeSolanaRpc;
use App\Tests\Support\SolanaTx;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Clock\Test\ClockSensitiveTrait;

/**
 * The whole subscription flow through the API, with a simulated Solana RPC serving mainnet-shaped transactions.
 */
final class SubscriptionFlowTest extends WebTestCase
{
    use ClockSensitiveTrait;

    private const WALLET = 'GkRNvZURAUAaw2skoXThmbydufAMm8HoTG9ZmLUraAJS';

    private KernelBrowser $client;

    protected function setUp(): void
    {
        FakeSolanaRpc::reset();
        $this->client = self::createClient();
        $this->client->disableReboot();
        $this->client->setServerParameters(['SCRIPT_NAME' => '/api/index.php', 'SCRIPT_FILENAME' => '/api/index.php']);
        $em = self::getContainer()->get(EntityManagerInterface::class);
        $tool = new SchemaTool($em);
        $tool->dropSchema($em->getMetadataFactory()->getAllMetadata());
        $tool->createSchema($em->getMetadataFactory()->getAllMetadata());
        // The RPC's genesis hash is cached: each test chooses its own.
        self::getContainer()->get('cache.app')->clear();
        self::mockTime('2026-10-05 10:00:00');
        $this->register('anne@example.com');
    }

    public function testEverythingRequiresAnAccount(): void
    {
        $this->json('POST', '/api/auth/logout');
        $this->json('GET', '/api/subscription/me');
        self::assertResponseStatusCodeSame(401);
        $this->json('POST', '/api/bot/token');
        self::assertResponseStatusCodeSame(401);
    }

    public function testWalletPaymentActivatesThirtyDaysOnce(): void
    {
        $me = $this->json('GET', '/api/subscription/me');
        self::assertNull($me['subscription']);
        self::assertSame(['available' => true, 'price' => '1.00', 'token' => 'USDC', 'network' => 'mainnet-beta', 'durationDays' => 30], $me['offer']);

        $intent = $this->intent();
        self::assertSame('pending', $intent['status']);
        self::assertSame('1.000000', $intent['amount']);
        self::assertSame('1000000', $intent['amountAtomic']);
        self::assertSame('41zCUJsKk6cMB94DDtm99qWmyMZfp4GkAhhuz4xTwePu', $intent['recipient']);
        self::assertSame(SolanaTx::USDC, $intent['tokenMint']);
        self::assertMatchesRegularExpression('/^SUB_[0-9a-f-]{36}$/', $intent['memo']);
        self::assertTrue(Base58::isPublicKey($intent['reference']));
        self::assertSame('2026-10-05T10:15:00Z', $intent['expiresAt']);
        self::assertSame('EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N', $intent['blockhash']['blockhash']);
        self::assertStringStartsWith('solana:41zCUJsKk6cMB94DDtm99qWmyMZfp4GkAhhuz4xTwePu?amount=1&spl-token='.SolanaTx::USDC.'&reference='.$intent['reference'], $intent['solanaPayUrl']);

        $signature = $this->pay($intent);
        $done = $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $signature]);
        self::assertResponseIsSuccessful();
        self::assertSame('confirmed', $done['payment']['status']);
        self::assertSame(self::WALLET, $done['payment']['walletAddress']);
        self::assertSame('https://solscan.io/tx/'.$signature, $done['payment']['explorerUrl']);
        self::assertSame(['status' => 'active', 'active' => true, 'startsAt' => '2026-10-05T10:00:00Z', 'expiresAt' => '2026-11-04T10:00:00Z'], $done['subscription']);

        // Same signature again (double click, retry after a timeout): same answer, no extra days.
        $again = $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $signature]);
        self::assertResponseIsSuccessful();
        self::assertSame('2026-11-04T10:00:00Z', $again['subscription']['expiresAt']);

        // The same transaction cannot pay a second request.
        $other = $this->intent();
        $reuse = $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $other['id'], 'signature' => $signature]);
        self::assertResponseStatusCodeSame(409);
        self::assertSame('PAYMENT_ALREADY_USED', $reuse['error']['code']);

        $history = $this->json('GET', '/api/subscription/payments')['payments'];
        self::assertCount(2, $history);
    }

    public function testRenewalAddsThirtyDaysAfterTheCurrentEnd(): void
    {
        $first = $this->intent();
        $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $first['id'], 'signature' => $this->pay($first)]);
        self::assertResponseIsSuccessful();

        self::mockTime('2026-10-25 08:00:00');
        $second = $this->intent();
        $renewed = $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $second['id'], 'signature' => $this->pay($second)]);
        self::assertSame('2026-12-04T10:00:00Z', $renewed['subscription']['expiresAt']);

        // After expiry, a new payment starts from the payment date.
        self::mockTime('2027-01-10 12:00:00');
        $this->login('anne@example.com');
        self::assertFalse($this->json('GET', '/api/subscription/me')['subscription']['active']);
        $third = $this->intent();
        $back = $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $third['id'], 'signature' => $this->pay($third)]);
        self::assertSame(['status' => 'active', 'active' => true, 'startsAt' => '2027-01-10T12:00:00Z', 'expiresAt' => '2027-02-09T12:00:00Z'], $back['subscription']);
    }

    public function testATransactionNotFinalizedYetIsProcessingThenConfirmedByPolling(): void
    {
        $intent = $this->intent();
        $signature = $this->pay($intent, finalized: false);
        $pending = $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $signature]);
        self::assertResponseStatusCodeSame(202);
        self::assertSame('TRANSACTION_PENDING', $pending['pending']['code']);
        self::assertSame('processing', $pending['payment']['status']);
        self::assertNull($this->json('GET', '/api/subscription/me')['subscription']);

        FakeSolanaRpc::$finalized[$signature] = FakeSolanaRpc::$confirmed[$signature];
        $polled = $this->json('GET', '/api/subscription/payment/'.$intent['id']);
        self::assertSame('confirmed', $polled['payment']['status']);
        self::assertTrue($polled['subscription']['active']);
    }

    public function testQrCodePaymentIsFoundThroughItsReference(): void
    {
        $intent = $this->intent(['method' => 'qr']);
        self::assertSame('qr', $intent['method']);
        self::assertArrayNotHasKey('blockhash', $intent);
        $polled = $this->json('GET', '/api/subscription/payment/'.$intent['id']);
        self::assertSame('pending', $polled['payment']['status']);

        // Paid from a phone wallet the site never saw.
        $this->pay($intent, payer: 'BSFhKkzSVUoxTDBGMfu9j4WwsPZpbHZbmCcPcghWMp87');
        $polled = $this->json('GET', '/api/subscription/payment/'.$intent['id']);
        self::assertSame('confirmed', $polled['payment']['status']);
        self::assertSame('BSFhKkzSVUoxTDBGMfu9j4WwsPZpbHZbmCcPcghWMp87', $polled['payment']['walletAddress']);
    }

    public function testWrongTransactionsAreRefusedWithoutActivating(): void
    {
        $intent = $this->intent();

        $wrongAmount = $this->pay($intent, amount: 999999);
        self::assertSame('INVALID_AMOUNT', $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $wrongAmount])['error']['code']);
        self::assertResponseStatusCodeSame(422);

        $otherWallet = $this->pay($intent, payer: 'BSFhKkzSVUoxTDBGMfu9j4WwsPZpbHZbmCcPcghWMp87');
        self::assertSame('INVALID_SENDER', $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $otherWallet])['error']['code']);

        $unknown = Base58::encode(random_bytes(64));
        $missing = $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $unknown]);
        self::assertResponseStatusCodeSame(202);
        self::assertSame('TRANSACTION_NOT_FOUND', $missing['pending']['code']);

        self::assertSame('INVALID_SIGNATURE', $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => 'pas-une-signature'])['error']['code']);
        self::assertSame('PAYMENT_INTENT_NOT_FOUND', $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => '00000000-0000-4000-8000-000000000000', 'signature' => $unknown])['error']['code']);
        self::assertResponseStatusCodeSame(404);

        $state = $this->json('GET', '/api/subscription/me');
        self::assertNull($state['subscription']);
        self::assertSame('INVALID_SENDER', $state['pendingPayment']['failureReason']);
    }

    public function testExpiredRequestsAndLateTransactions(): void
    {
        $intent = $this->intent();
        $late = $this->pay($intent, blockTime: strtotime('2026-10-05 10:17:01 UTC'));
        $refused = $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $late]);
        self::assertResponseStatusCodeSame(410);
        self::assertSame('PAYMENT_INTENT_EXPIRED', $refused['error']['code']);

        // Sent in time but checked much later (page closed, RPC down): still accepted.
        $intime = $this->pay($intent, blockTime: strtotime('2026-10-05 10:14:00 UTC'));
        self::mockTime('2026-10-05 12:00:00');
        $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $intime]);
        self::assertResponseIsSuccessful();

        // A request nobody paid is closed after its deadline.
        $unpaid = $this->intent();
        self::mockTime('2026-10-05 12:30:00');
        self::assertSame('expired', $this->json('GET', '/api/subscription/payment/'.$unpaid['id'])['payment']['status']);
    }

    public function testRpcFailuresNeverActivate(): void
    {
        $intent = $this->intent();
        $signature = $this->pay($intent);
        FakeSolanaRpc::$down = true;
        $failed = $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $signature]);
        self::assertResponseStatusCodeSame(503);
        self::assertSame('RPC_UNAVAILABLE', $failed['error']['code']);
        self::assertSame('pending', $this->json('GET', '/api/subscription/payment/'.$intent['id'])['payment']['status']);

        FakeSolanaRpc::$down = false;
        self::assertSame('confirmed', $this->json('GET', '/api/subscription/payment/'.$intent['id'])['payment']['status']);
    }

    public function testAnRpcOnAnotherNetworkIsRefused(): void
    {
        FakeSolanaRpc::$genesis = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
        $this->json('POST', '/api/subscription/payment-intent', ['method' => 'wallet', 'walletAddress' => self::WALLET]);
        self::assertResponseStatusCodeSame(503);
    }

    public function testBalancesAndWalletAreCheckedBeforeCreatingARequest(): void
    {
        self::assertSame('WALLET_NOT_CONNECTED', $this->json('POST', '/api/subscription/payment-intent', ['method' => 'wallet'])['error']['code']);
        self::assertSame('INVALID_WALLET', $this->json('POST', '/api/subscription/payment-intent', ['method' => 'wallet', 'walletAddress' => 'abc'])['error']['code']);
        FakeSolanaRpc::$usdc = '999999';
        self::assertSame('INSUFFICIENT_USDC', $this->json('POST', '/api/subscription/payment-intent', ['method' => 'wallet', 'walletAddress' => self::WALLET])['error']['code']);
        FakeSolanaRpc::$usdc = '1000000';
        FakeSolanaRpc::$lamports = 0;
        self::assertSame('INSUFFICIENT_SOL', $this->json('POST', '/api/subscription/payment-intent', ['method' => 'wallet', 'walletAddress' => self::WALLET])['error']['code']);
    }

    public function testPaymentsArePrivateToTheirAccount(): void
    {
        $intent = $this->intent();
        $signature = $this->pay($intent);
        $this->json('POST', '/api/auth/logout');
        $this->register('bob@example.com');
        self::assertSame('PAYMENT_INTENT_NOT_FOUND', $this->json('GET', '/api/subscription/payment/'.$intent['id'])['error']['code']);
        self::assertSame('PAYMENT_INTENT_NOT_FOUND', $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $signature])['error']['code']);
    }

    public function testBotAccessRequiresAnActiveSubscription(): void
    {
        $refused = $this->json('POST', '/api/bot/token');
        self::assertResponseStatusCodeSame(403);
        self::assertSame('SUBSCRIPTION_REQUIRED', $refused['error']['code']);

        $intent = $this->intent();
        $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => $this->pay($intent)]);
        $access = $this->json('POST', '/api/bot/token');
        self::assertResponseIsSuccessful();
        self::assertMatchesRegularExpression('/^[A-Z2-7]{130}$/', $access['token']);
        self::assertSame('https://bot.test.invalid', $access['url']);
        self::assertSame('2026-11-04T10:00:00Z', $access['expiresAt']);

        self::mockTime('2026-11-04 10:00:01');
        $this->login('anne@example.com');
        $this->json('POST', '/api/bot/token');
        self::assertResponseStatusCodeSame(403);
    }

    public function testTheBrowserCannotActivateBySayingSo(): void
    {
        $intent = $this->intent();
        $this->json('POST', '/api/subscription/payment/verify', ['paymentId' => $intent['id'], 'signature' => Base58::encode(random_bytes(64)), 'status' => 'confirmed']);
        self::assertResponseStatusCodeSame(202);
        $this->json('POST', '/api/subscription/activate', ['days' => 30]);
        self::assertResponseStatusCodeSame(404);
        self::assertNull($this->json('GET', '/api/subscription/me')['subscription']);
    }

    /**
     * @param array<string, mixed> $body
     *
     * @return array<string, mixed>
     */
    private function intent(array $body = ['method' => 'wallet', 'walletAddress' => self::WALLET]): array
    {
        $response = $this->json('POST', '/api/subscription/payment-intent', $body);
        self::assertResponseStatusCodeSame(201);

        return $response['payment'];
    }

    /**
     * Puts on the simulated chain a transaction paying the request, and returns its signature.
     *
     * @param array<string, mixed> $intent
     */
    private function pay(array $intent, string $payer = self::WALLET, ?int $amount = null, ?int $blockTime = null, bool $finalized = true): string
    {
        $signature = Base58::encode(random_bytes(64));
        $tx = SolanaTx::payment($signature, $payer, $amount ?? (int) $intent['amountAtomic'], $intent['memo'], $intent['reference'], $blockTime ?? (int) strtotime($intent['createdAt']) + 30);
        if ($finalized) {
            FakeSolanaRpc::$finalized[$signature] = $tx;
        } else {
            FakeSolanaRpc::$confirmed[$signature] = $tx;
        }

        return $signature;
    }

    private function register(string $email): void
    {
        $this->json('POST', '/api/auth/register', ['email' => $email, 'password' => 'motdepasse-solide']);
        self::assertResponseStatusCodeSame(201);
    }

    /** Device sessions end after 30 days without use: tests that jump further sign in again. */
    private function login(string $email): void
    {
        $this->json('POST', '/api/auth/login', ['email' => $email, 'password' => 'motdepasse-solide']);
        self::assertResponseIsSuccessful();
    }

    /**
     * @param array<string, mixed>|null $body
     *
     * @return array<string, mixed>
     */
    private function json(string $method, string $uri, ?array $body = null): array
    {
        $server = ['HTTP_X_REQUESTED_WITH' => 'byhnex', 'CONTENT_TYPE' => 'application/json'];
        $this->client->request($method, $uri, server: $server, content: null === $body ? null : (string) json_encode($body));
        $data = json_decode((string) $this->client->getResponse()->getContent(), true);

        return \is_array($data) ? $data : [];
    }
}
