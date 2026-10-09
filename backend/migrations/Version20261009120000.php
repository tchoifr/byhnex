<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Platforms\AbstractMySQLPlatform;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * osvalt16's account: bot subscription always active, as requested by the owner on 2026-10-09.
 * The account is found by the SHA-256 of its e-mail address, so the address stays out of this public repository.
 * Without that account (CI, or before he signs up) the migration is skipped, hence not recorded, and is tried
 * again at the next deployment.
 */
final class Version20261009120000 extends AbstractMigration
{
    private const EMAIL_SHA256 = 'c1af590f9a8ef1d20e68fa3ba61869af7df7784c8abf8940ce6468b3ca546ef0';
    private const UNTIL = '2099-12-31 23:59:59';

    public function getDescription(): string
    {
        return 'Abonnement au bot permanent pour le compte d\'osvalt16';
    }

    public function up(Schema $schema): void
    {
        $this->abortIf(!$this->connection->getDatabasePlatform() instanceof AbstractMySQLPlatform, 'Migration écrite pour MySQL 8.');

        $userId = $this->connection->fetchOne('SELECT id FROM users WHERE SHA2(email, 256) = ?', [self::EMAIL_SHA256]);
        $this->skipIf(false === $userId, 'Compte d\'osvalt16 absent : nouvel essai au prochain déploiement.');
        $this->write(sprintf('Abonnement permanent pour le compte %s.', (string) $userId));

        $this->addSql(
            'INSERT INTO subscriptions (user_id, starts_at, expires_at, last_payment_id, created_at, updated_at)
             VALUES (:user, UTC_TIMESTAMP(), :until, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE expires_at = GREATEST(expires_at, :until), updated_at = UTC_TIMESTAMP()',
            ['user' => $userId, 'until' => self::UNTIL],
        );
    }

    public function down(Schema $schema): void
    {
        // The subscription is left as is: removing it could also remove days that were paid for.
    }
}
