<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Platforms\AbstractMySQLPlatform;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Accounts, sessions, synced data and login throttling.
 * On a new database the tables are created. On the production database, created by the first
 * plain-PHP API, only the foreign key and index names change to Doctrine's naming.
 */
final class Version20261005120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Comptes, sessions, données synchronisées et limitation des connexions';
    }

    public function up(Schema $schema): void
    {
        $this->abortIf(!$this->connection->getDatabasePlatform() instanceof AbstractMySQLPlatform, 'Migration écrite pour MySQL 8.');

        if ($schema->hasTable('users')) {
            $this->addSql('ALTER TABLE sessions DROP FOREIGN KEY sessions_user');
            $this->addSql('ALTER TABLE sessions RENAME INDEX sessions_user TO IDX_9A609D13A76ED395');
            $this->addSql('ALTER TABLE sessions ADD CONSTRAINT FK_9A609D13A76ED395 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE');
            $this->addSql('ALTER TABLE user_data DROP FOREIGN KEY user_data_user');
            $this->addSql('ALTER TABLE user_data ADD CONSTRAINT FK_D772BFAAA76ED395 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE');
            $this->addSql('DROP TABLE IF EXISTS schema_migrations');

            return;
        }

        $options = 'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB';
        $this->addSql("CREATE TABLE users (id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL, email VARCHAR(254) NOT NULL, password_hash VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL, last_login_at DATETIME DEFAULT NULL, UNIQUE INDEX users_email (email), PRIMARY KEY (id)) $options");
        $this->addSql("CREATE TABLE sessions (id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL, token_hash CHAR(64) NOT NULL, created_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, last_seen_at DATETIME NOT NULL, user_agent VARCHAR(255) DEFAULT '' NOT NULL, user_id BIGINT UNSIGNED NOT NULL, INDEX sessions_expiry (expires_at), UNIQUE INDEX sessions_token (token_hash), INDEX IDX_9A609D13A76ED395 (user_id), PRIMARY KEY (id)) $options");
        $this->addSql("CREATE TABLE user_data (data LONGTEXT NOT NULL, version INT UNSIGNED NOT NULL, updated_at DATETIME NOT NULL, user_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (user_id)) $options");
        $this->addSql("CREATE TABLE login_attempts (id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL, ip VARCHAR(45) NOT NULL, email VARCHAR(254) NOT NULL, kind VARCHAR(16) NOT NULL, attempted_at DATETIME NOT NULL, INDEX attempts_ip (ip, kind, attempted_at), INDEX attempts_email (email, kind, attempted_at), PRIMARY KEY (id)) $options");
        $this->addSql('ALTER TABLE sessions ADD CONSTRAINT FK_9A609D13A76ED395 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE user_data ADD CONSTRAINT FK_D772BFAAA76ED395 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE user_data');
        $this->addSql('DROP TABLE sessions');
        $this->addSql('DROP TABLE login_attempts');
        $this->addSql('DROP TABLE users');
    }

    public function isTransactional(): bool
    {
        // MySQL commits DDL statements implicitly.
        return false;
    }
}
