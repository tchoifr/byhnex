<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Platforms\AbstractMySQLPlatform;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Bot subscription: payment requests settled in USDC on Solana, and one subscription per account.
 */
final class Version20261005180000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Paiements USDC Solana et abonnements au bot';
    }

    public function up(Schema $schema): void
    {
        $this->abortIf(!$this->connection->getDatabasePlatform() instanceof AbstractMySQLPlatform, 'Migration écrite pour MySQL 8.');

        $options = 'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci ENGINE = InnoDB';
        $this->addSql("CREATE TABLE payments (id CHAR(36) NOT NULL, method VARCHAR(8) NOT NULL, wallet_address VARCHAR(44) DEFAULT NULL, network VARCHAR(16) NOT NULL, token VARCHAR(8) NOT NULL, token_mint VARCHAR(44) NOT NULL, recipient VARCHAR(44) NOT NULL, amount NUMERIC(18, 6) NOT NULL, amount_atomic BIGINT UNSIGNED NOT NULL, memo VARCHAR(64) NOT NULL, reference VARCHAR(44) NOT NULL, transaction_signature VARCHAR(88) DEFAULT NULL, status VARCHAR(16) NOT NULL, failure_reason VARCHAR(40) DEFAULT NULL, created_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, confirmed_at DATETIME DEFAULT NULL, updated_at DATETIME NOT NULL, user_id BIGINT UNSIGNED NOT NULL, INDEX payments_user_created (user_id, created_at), UNIQUE INDEX payments_memo (memo), UNIQUE INDEX payments_reference (reference), UNIQUE INDEX payments_signature (transaction_signature), INDEX IDX_65D29B32A76ED395 (user_id), PRIMARY KEY (id)) $options");
        $this->addSql("CREATE TABLE subscriptions (id BIGINT UNSIGNED AUTO_INCREMENT NOT NULL, starts_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, user_id BIGINT UNSIGNED NOT NULL, last_payment_id CHAR(36) DEFAULT NULL, UNIQUE INDEX subscriptions_user (user_id), INDEX IDX_4778A01EDB7C951 (last_payment_id), PRIMARY KEY (id)) $options");
        $this->addSql('ALTER TABLE payments ADD CONSTRAINT FK_65D29B32A76ED395 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE subscriptions ADD CONSTRAINT FK_4778A01A76ED395 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE subscriptions ADD CONSTRAINT FK_4778A01EDB7C951 FOREIGN KEY (last_payment_id) REFERENCES payments (id) ON DELETE SET NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE subscriptions');
        $this->addSql('DROP TABLE payments');
    }

    public function isTransactional(): bool
    {
        // MySQL commits DDL statements implicitly.
        return false;
    }
}
