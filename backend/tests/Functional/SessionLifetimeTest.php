<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Security\SessionManager;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\BrowserKit\Cookie;
use Symfony\Component\Clock\Test\ClockSensitiveTrait;

final class SessionLifetimeTest extends WebTestCase
{
    use ClockSensitiveTrait;

    private KernelBrowser $client;

    protected function setUp(): void
    {
        $this->client = self::createClient();
        // Same front controller path as production (www/api/index.php), so routes live under /api.
        $this->client->setServerParameters(['SCRIPT_NAME' => '/api/index.php', 'SCRIPT_FILENAME' => '/api/index.php']);
        $em = self::getContainer()->get(EntityManagerInterface::class);
        $tool = new SchemaTool($em);
        $tool->dropSchema($em->getMetadataFactory()->getAllMetadata());
        $tool->createSchema($em->getMetadataFactory()->getAllMetadata());
    }

    public function testSessionIsExtendedHourlyAndExpiresAfterThirtyDaysWithoutUse(): void
    {
        $clock = self::mockTime('2026-10-05 10:00:00');
        $this->json('POST', '/api/auth/register', ['email' => 'anne@example.com', 'password' => 'motdepasse-solide']);
        self::assertResponseStatusCodeSame(201);
        $cookie = $this->sessionCookie();
        self::assertNotNull($cookie);
        self::assertSame('2026-11-04 10:00:00', date('Y-m-d H:i:s', (int) $cookie->getExpiresTime()));

        $clock->sleep(30 * 60);
        $this->json('GET', '/api/auth/me');
        self::assertResponseIsSuccessful();
        self::assertNull($this->responseCookie(), 'Pas de renouvellement avant une heure.');

        $clock->sleep(2 * 3600);
        $this->json('GET', '/api/auth/me');
        self::assertResponseIsSuccessful();
        $renewed = $this->responseCookie();
        self::assertNotNull($renewed, 'Session renouvelée après une heure.');
        self::assertSame('2026-11-04 12:30:00', date('Y-m-d H:i:s', (int) $renewed->getExpiresTime()));

        $clock->sleep(31 * 86400);
        $this->json('GET', '/api/auth/me');
        self::assertResponseStatusCodeSame(401);
        self::assertSame('not_authenticated', $this->error());
    }

    public function testWritesWithoutTheCustomHeaderAreRefused(): void
    {
        $this->client->request('POST', '/api/auth/login', server: ['CONTENT_TYPE' => 'application/json'], content: '{}');
        self::assertResponseStatusCodeSame(403);
        self::assertSame('forbidden', $this->error());
    }

    public function testUnknownRoutesAndMethodsAreNotFound(): void
    {
        $this->json('GET', '/api/auth/login');
        self::assertResponseStatusCodeSame(404);
        self::assertSame('not_found', $this->error());
    }

    /**
     * @param array<string, mixed>|null $body
     */
    private function json(string $method, string $uri, ?array $body = null): void
    {
        $server = ['HTTP_X_REQUESTED_WITH' => 'byhnex', 'CONTENT_TYPE' => 'application/json'];
        $this->client->request($method, $uri, server: $server, content: null === $body ? null : (string) json_encode($body));
    }

    private function sessionCookie(): ?Cookie
    {
        return $this->client->getCookieJar()->get(SessionManager::COOKIE, '/api');
    }

    private function responseCookie(): ?\Symfony\Component\HttpFoundation\Cookie
    {
        foreach ($this->client->getResponse()->headers->getCookies() as $cookie) {
            if (SessionManager::COOKIE === $cookie->getName()) {
                return $cookie;
            }
        }

        return null;
    }

    private function error(): ?string
    {
        $body = json_decode((string) $this->client->getResponse()->getContent(), true);

        return \is_array($body) ? ($body['error']['code'] ?? null) : null;
    }
}
