<?php
// Applies pending SQL migrations in order. Command line only: php api/bin/migrate.php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/app.php';

$pdo = Byhnex\Api\db();
$pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');

$applied = $pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
$files = glob(dirname(__DIR__) . '/migrations/*.sql');
sort($files);
$count = 0;
foreach ($files as $file) {
    $version = basename($file, '.sql');
    if (in_array($version, $applied, true)) {
        continue;
    }
    // Statements end with a semicolon at the end of a line; migrations contain no procedures.
    foreach (preg_split('/;\s*$/m', (string)file_get_contents($file)) as $statement) {
        $sql = trim((string)preg_replace('/^\s*--.*$/m', '', $statement));
        if ($sql !== '') {
            $pdo->exec($sql);
        }
    }
    $pdo->prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')->execute([$version, gmdate('Y-m-d H:i:s')]);
    echo "Migration appliquée : $version\n";
    $count++;
}
echo $count ? "$count migration(s) appliquée(s).\n" : "Base à jour, aucune migration en attente.\n";
