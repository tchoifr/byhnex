<?php

// Run on the server by the deployment (php < deploy/bootstrap-env.php).
// First Symfony deployment only: creates ~/byhnex-api/.env.local from the configuration file of the
// first plain-PHP API (~/.secrets/byhnex-config.php). Secrets never leave the server.

$home = (string) getenv('HOME');
// STDERR is not defined when PHP reads the script from standard input.
$err = fopen('php://stderr', 'w');
$target = $home.'/byhnex-api/.env.local';
if (is_file($target)) {
    echo ".env.local déjà présent.\n";
    exit(0);
}

$legacy = $home.'/.secrets/byhnex-config.php';
if (!is_file($legacy)) {
    fwrite($err, "Ni ~/byhnex-api/.env.local ni ~/.secrets/byhnex-config.php : créez .env.local (voir deploy/README.md).\n");
    exit(1);
}

$config = require $legacy;
$db = $config['db'];
foreach (['user', 'password', 'host', 'name'] as $key) {
    // Symfony resolves %…% and $… inside .env values: keep to characters that need no escaping.
    if (!preg_match('/^[A-Za-z0-9._-]+$/', (string) $db[$key])) {
        fwrite($err, "La valeur db.$key contient des caractères spéciaux : créez .env.local à la main (voir deploy/README.md).\n");
        exit(1);
    }
}

$url = sprintf('mysql://%s:%s@%s:%d/%s?serverVersion=8.4.11&charset=utf8mb4', $db['user'], $db['password'], $db['host'], $db['port'] ?? 3306, $db['name']);
if (!is_dir($home.'/byhnex-api')) {
    mkdir($home.'/byhnex-api', 0705, true);
}
umask(077);
file_put_contents($target, implode("\n", [
    "# Configuration privée de l'API Symfony byhnex.com, créée au premier déploiement. Ne jamais la committer.",
    'APP_ENV=prod',
    'APP_DEBUG=0',
    'APP_SECRET='.bin2hex(random_bytes(32)),
    'DATABASE_URL="'.$url.'"',
    'ALLOWED_ORIGINS=https://byhnex.com',
    'SESSION_COOKIE_SECURE=1',
    '',
]));
chmod($target, 0600);
echo ".env.local créé à partir de ~/.secrets/byhnex-config.php.\n";
