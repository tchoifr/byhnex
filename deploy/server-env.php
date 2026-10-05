<?php

// Run on the server by the deployment (php < deploy/server-env.php), after bootstrap-env.php.
// 1. Bot access key: creates the Ed25519 key that signs the subscribers' bot codes (in ~/byhnex-api/.env.local,
//    never leaves the server) and prints its PUBLIC half, which the deployment gives to the bot server.
// 2. Payment settings: ~/byhnex-api/.env.deploy.tmp, sent just before over SSH from the GitHub secrets
//    (KEY=value lines), is checked and merged into ~/byhnex-api/.env.prod.local, then deleted. An empty value
//    keeps the one already on the server. Nothing secret is printed.

$home = (string) getenv('HOME');
$dir = $home.'/byhnex-api';
umask(077);
// STDERR is not defined when PHP reads the script from standard input.
$err = fopen('php://stderr', 'w');

// ---------- 1. Bot access key ----------
$local = $dir.'/.env.local';
if (!is_file($local)) {
    fwrite($err, "~/byhnex-api/.env.local absent : lancez d'abord deploy/bootstrap-env.php.\n");
    exit(1);
}
$content = (string) file_get_contents($local);
if (!preg_match('/^BOT_TOKEN_SECRET_KEY=([0-9a-f]{128})$/m', $content, $m)) {
    $secret = sodium_crypto_sign_secretkey(sodium_crypto_sign_keypair());
    $content = rtrim($content, "\n")."\n# Clé Ed25519 des codes d'accès au bot des abonnés (la clé publique est sur le serveur du bot).\nBOT_TOKEN_SECRET_KEY=".bin2hex($secret)."\n";
    file_put_contents($local, $content);
    chmod($local, 0600);
    fwrite($err, "Clé du bot créée dans .env.local.\n");
} else {
    $secret = (string) hex2bin($m[1]);
}

// ---------- 2. Payment settings ----------
$rules = [
    // Helius (or any Solana RPC) URL, may carry an API key: HTTPS, URL characters only (no $ or %, read by Symfony).
    'SOLANA_RPC_URL' => '#^https://[A-Za-z0-9.-]+(:\d+)?(/[A-Za-z0-9._~/-]*)?(\?[A-Za-z0-9._~=&-]*)?$#',
    'PLATFORM_SOLANA_WALLET' => '/^[1-9A-HJ-NP-Za-km-z]{32,44}$/',
    'BOT_SERVER_URL' => '#^https://[A-Za-z0-9.-]+$#',
];
$prodFile = $dir.'/.env.prod.local';
$current = [];
foreach (is_file($prodFile) ? (array) file($prodFile, \FILE_IGNORE_NEW_LINES) : [] as $line) {
    if (preg_match('/^([A-Z_]+)=(.*)$/', (string) $line, $kv) && isset($rules[$kv[1]])) {
        $current[$kv[1]] = $kv[2];
    }
}
$tmp = $dir.'/.env.deploy.tmp';
$given = [];
foreach (is_file($tmp) ? (array) file($tmp, \FILE_IGNORE_NEW_LINES) : [] as $line) {
    if (preg_match('/^([A-Z_]+)=(.*)$/', trim((string) $line), $kv) && isset($rules[$kv[1]]) && '' !== $kv[2]) {
        if (!preg_match($rules[$kv[1]], $kv[2])) {
            @unlink($tmp);
            fwrite($err, "Valeur refusée pour {$kv[1]} (format inattendu) : corrigez le secret GitHub.\n");
            exit(1);
        }
        $given[$kv[1]] = $kv[2];
    }
}
@unlink($tmp);
$values = array_merge($current, $given);
$lines = ["# Réglages des paiements et du bot, écrits par le déploiement depuis les secrets GitHub. Ne jamais committer."];
foreach ($values as $key => $value) {
    $lines[] = $key.'='.$value;
}
file_put_contents($prodFile, implode("\n", $lines)."\n");
chmod($prodFile, 0600);
fwrite($err, 'Paiements : '.implode(', ', array_map(static fn (string $k): string => $k.(isset($values[$k]) ? ' ✓' : ' absent'), array_keys($rules)))."\n");

// The only output on stdout: the public key, read by the deployment.
echo bin2hex(sodium_crypto_sign_publickey_from_secretkey($secret)), "\n";
