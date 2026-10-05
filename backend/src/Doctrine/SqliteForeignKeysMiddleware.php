<?php

declare(strict_types=1);

namespace App\Doctrine;

use Doctrine\DBAL\Driver;
use Doctrine\DBAL\Driver\Connection;
use Doctrine\DBAL\Driver\Middleware;
use Doctrine\DBAL\Driver\Middleware\AbstractDriverMiddleware;

/**
 * Tests run on SQLite, which only applies ON DELETE CASCADE once foreign keys are switched on.
 * Other databases (MySQL in CI and production) are left untouched.
 */
final class SqliteForeignKeysMiddleware implements Middleware
{
    public function wrap(Driver $driver): Driver
    {
        return new class($driver) extends AbstractDriverMiddleware {
            public function connect(array $params): Connection
            {
                $connection = parent::connect($params);
                if (\in_array($params['driver'] ?? null, ['pdo_sqlite', 'sqlite3'], true)) {
                    $connection->exec('PRAGMA foreign_keys = ON');
                }

                return $connection;
            }
        };
    }
}
