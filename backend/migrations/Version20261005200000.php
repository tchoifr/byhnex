<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Platforms\AbstractMySQLPlatform;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Owner's account (id 5 on byhnex.com): bot subscription always active, as requested by the owner on 2026-10-05.
 * Does nothing on a database without this account (CI, new installs).
 */
final class Version20261005200000 extends AbstractMigration
{
    private const OWNER_ID = 5;
    private const UNTIL = '2099-12-31 23:59:59';

    public function getDescription(): string
    {
        return 'Abonnement au bot permanent pour le compte du propriétaire (id 5)';
    }

    public function up(Schema $schema): void
    {
        $this->abortIf(!$this->connection->getDatabasePlatform() instanceof AbstractMySQLPlatform, 'Migration écrite pour MySQL 8.');

        $this->addSql(
            'INSERT INTO subscriptions (user_id, starts_at, expires_at, last_payment_id, created_at, updated_at)
             SELECT id, UTC_TIMESTAMP(), :until, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM users WHERE id = :owner
             ON DUPLICATE KEY UPDATE expires_at = GREATEST(expires_at, :until), updated_at = UTC_TIMESTAMP()',
            ['until' => self::UNTIL, 'owner' => self::OWNER_ID],
        );
    }

    public function down(Schema $schema): void
    {
        // The subscription is left as is: removing it could also remove days that were paid for.
    }
}
