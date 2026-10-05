<?php
// Byhnex API: accounts and synchronisation of the site's browser data. PHP 8.2, MySQL 8.
declare(strict_types=1);

namespace Byhnex\Api;

use PDO;
use Throwable;

const SESSION_COOKIE = 'byhnex_session';
const SESSION_DAYS = 30;
const MAX_BODY_BYTES = 3_000_000;
const MAX_DATA_BYTES = 2_000_000;
// Browser storage keys that hold user data. Caches and secrets stay on the device.
const SYNC_KEYS = [
    'cryptonite-v1', 'crypto-portfolio-v1', 'byhnex-reserve-eur', 'byhnex-favorites',
    'byhnex-devise', 'byhnex-bot-prefs-v1', 'byhnex-bot-mode-v1',
];

final class HttpError extends \RuntimeException
{
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message, public readonly array $extra = [])
    {
        parent::__construct($message);
    }
}

function config(): array
{
    static $config;
    if ($config === null) {
        $path = getenv('BYHNEX_CONFIG') ?: dirname(__DIR__, 3) . '/.secrets/byhnex-config.php';
        if (!is_file($path)) {
            throw new \RuntimeException('Configuration absente : ' . $path);
        }
        $config = require $path;
    }
    return $config;
}

function db(): PDO
{
    static $pdo;
    if ($pdo === null) {
        $c = config()['db'];
        $pdo = new PDO(
            sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], $c['port'] ?? 3306, $c['name']),
            $c['user'],
            $c['password'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
        );
        $pdo->exec("SET time_zone = '+00:00'");
    }
    return $pdo;
}

function now(int $offsetSeconds = 0): string
{
    return gmdate('Y-m-d H:i:s', time() + $offsetSeconds);
}

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array
{
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (!str_starts_with(strtolower($type), 'application/json')) {
        throw new HttpError(415, 'json_required', 'Envoyez les données au format JSON.');
    }
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        throw new HttpError(413, 'too_large', 'Les données envoyées sont trop volumineuses.');
    }
    $data = json_decode($raw === '' ? '{}' : $raw, true);
    if (!is_array($data)) {
        throw new HttpError(400, 'invalid_json', 'Le JSON envoyé est invalide.');
    }
    return $data;
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

// Writes must carry a custom header (forces a CORS preflight that this API never grants)
// and, when the browser sends one, an Origin from the allowed list.
function check_write_request(): void
{
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'byhnex') {
        throw new HttpError(403, 'forbidden', 'Requête refusée.');
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && !in_array($origin, config()['allowed_origins'] ?? [], true)) {
        throw new HttpError(403, 'forbidden_origin', 'Origine non autorisée.');
    }
}

function normalize_email(mixed $email): string
{
    $email = strtolower(trim((string)$email));
    if (strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        throw new HttpError(422, 'invalid_email', 'Adresse e-mail invalide.');
    }
    return $email;
}

function check_password(mixed $password): string
{
    $password = (string)$password;
    $length = mb_strlen($password);
    if ($length < 10 || $length > 256) {
        throw new HttpError(422, 'weak_password', 'Le mot de passe doit contenir entre 10 et 256 caractères.');
    }
    return $password;
}

function hash_password(string $password): string
{
    return password_hash($password, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
}

function throttle(string $kind, string $email, int $maxPerIp, int $maxPerEmail, int $windowSeconds): void
{
    $since = now(-$windowSeconds);
    $q = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE kind = ? AND attempted_at > ? AND ip = ?');
    $q->execute([$kind, $since, client_ip()]);
    $byIp = (int)$q->fetchColumn();
    $q = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE kind = ? AND attempted_at > ? AND email = ?');
    $q->execute([$kind, $since, $email]);
    if ($byIp >= $maxPerIp || (int)$q->fetchColumn() >= $maxPerEmail) {
        throw new HttpError(429, 'too_many_attempts', 'Trop de tentatives. Réessayez dans ' . (int)ceil($windowSeconds / 60) . ' minutes.');
    }
}

function record_attempt(string $kind, string $email): void
{
    db()->prepare('INSERT INTO login_attempts (ip, email, kind, attempted_at) VALUES (?, ?, ?, ?)')
        ->execute([client_ip(), $email, $kind, now()]);
    if (random_int(1, 50) === 1) {
        db()->prepare('DELETE FROM login_attempts WHERE attempted_at < ?')->execute([now(-86400)]);
        db()->prepare('DELETE FROM sessions WHERE expires_at < ?')->execute([now()]);
    }
}

function set_session_cookie(string $token, int $expires): void
{
    setcookie(SESSION_COOKIE, $token, [
        'expires' => $expires, 'path' => '/api', 'secure' => config()['cookie_secure'] ?? true,
        'httponly' => true, 'samesite' => 'Lax',
    ]);
}

function start_session(int $userId): void
{
    $token = bin2hex(random_bytes(32));
    $expires = time() + SESSION_DAYS * 86400;
    db()->prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$userId, hash('sha256', $token), now(), gmdate('Y-m-d H:i:s', $expires), now(), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
    db()->prepare('UPDATE users SET last_login_at = ? WHERE id = ?')->execute([now(), $userId]);
    set_session_cookie($token, $expires);
}

function current_session(): ?array
{
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }
    $q = db()->prepare('SELECT s.id AS session_id, s.last_seen_at, u.id, u.email, u.password_hash, u.created_at
        FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?');
    $q->execute([hash('sha256', $token), now()]);
    $session = $q->fetch() ?: null;
    // Sliding expiry, refreshed at most once an hour.
    if ($session && strtotime($session['last_seen_at'] . ' UTC') < time() - 3600) {
        $expires = time() + SESSION_DAYS * 86400;
        db()->prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
            ->execute([now(), gmdate('Y-m-d H:i:s', $expires), $session['session_id']]);
        set_session_cookie($token, $expires);
    }
    return $session;
}

function require_session(): array
{
    return current_session() ?? throw new HttpError(401, 'not_authenticated', 'Connectez-vous pour continuer.');
}

function public_user(array $user): array
{
    return ['email' => $user['email'], 'createdAt' => $user['created_at'] . 'Z'];
}

function read_data(int $userId): array
{
    $q = db()->prepare('SELECT data, version, updated_at FROM user_data WHERE user_id = ?');
    $q->execute([$userId]);
    $row = $q->fetch();
    return $row
        ? ['version' => (int)$row['version'], 'updatedAt' => $row['updated_at'] . 'Z', 'data' => json_decode($row['data'])]
        : ['version' => 0, 'updatedAt' => null, 'data' => null];
}

function validate_data(mixed $data): array
{
    if (!is_array($data) || ($data !== [] && array_is_list($data))) {
        throw new HttpError(422, 'invalid_data', 'Les données doivent être un objet.');
    }
    foreach ($data as $key => $value) {
        if (!in_array($key, SYNC_KEYS, true)) {
            throw new HttpError(422, 'unknown_key', 'Clé non synchronisable : ' . $key);
        }
        if ($value !== null && !is_string($value)) {
            throw new HttpError(422, 'invalid_value', 'Valeur invalide pour ' . $key);
        }
    }
    return $data;
}

function route(string $method, string $path): void
{
    switch ("$method $path") {
        case 'GET /health':
            db()->query('SELECT 1');
            respond(200, ['ok' => true, 'database' => 'ok', 'time' => gmdate('c')]);

        case 'POST /auth/register':
            check_write_request();
            $in = body();
            $email = normalize_email($in['email'] ?? '');
            $password = check_password($in['password'] ?? '');
            throttle('register', $email, 10, 5, 3600);
            record_attempt('register', $email);
            $exists = db()->prepare('SELECT 1 FROM users WHERE email = ?');
            $exists->execute([$email]);
            if ($exists->fetchColumn()) {
                throw new HttpError(409, 'email_taken', 'Un compte existe déjà avec cette adresse e-mail.');
            }
            db()->prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)')
                ->execute([$email, hash_password($password), now()]);
            $id = (int)db()->lastInsertId();
            start_session($id);
            respond(201, ['user' => ['email' => $email, 'createdAt' => now() . 'Z']]);

        case 'POST /auth/login':
            check_write_request();
            $in = body();
            $email = normalize_email($in['email'] ?? '');
            $password = (string)($in['password'] ?? '');
            throttle('login', $email, 20, 8, 900);
            $q = db()->prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?');
            $q->execute([$email]);
            $user = $q->fetch();
            if (!$user || !password_verify($password, $user['password_hash'])) {
                record_attempt('login', $email);
                throw new HttpError(401, 'invalid_credentials', 'Adresse e-mail ou mot de passe incorrect.');
            }
            if (password_needs_rehash($user['password_hash'], defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) {
                db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([hash_password($password), $user['id']]);
            }
            start_session((int)$user['id']);
            respond(200, ['user' => public_user($user)]);

        case 'POST /auth/logout':
            check_write_request();
            if ($session = current_session()) {
                db()->prepare('DELETE FROM sessions WHERE id = ?')->execute([$session['session_id']]);
            }
            set_session_cookie('', time() - 3600);
            respond(200, ['ok' => true]);

        case 'GET /auth/me':
            respond(200, ['user' => public_user(require_session())]);

        case 'POST /auth/password':
            check_write_request();
            $session = require_session();
            $in = body();
            if (!password_verify((string)($in['currentPassword'] ?? ''), $session['password_hash'])) {
                throw new HttpError(401, 'invalid_credentials', 'Mot de passe actuel incorrect.');
            }
            $next = check_password($in['newPassword'] ?? '');
            db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([hash_password($next), $session['id']]);
            db()->prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?')->execute([$session['id'], $session['session_id']]);
            respond(200, ['ok' => true]);

        case 'DELETE /account':
            check_write_request();
            $session = require_session();
            $in = body();
            if (!password_verify((string)($in['password'] ?? ''), $session['password_hash'])) {
                throw new HttpError(401, 'invalid_credentials', 'Mot de passe incorrect.');
            }
            db()->prepare('DELETE FROM users WHERE id = ?')->execute([$session['id']]);
            set_session_cookie('', time() - 3600);
            respond(200, ['ok' => true]);

        case 'GET /data':
            respond(200, read_data((int)require_session()['id']));

        case 'PUT /data':
            check_write_request();
            $session = require_session();
            $in = body();
            $data = validate_data($in['data'] ?? null);
            $json = json_encode((object)$data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (strlen($json) > MAX_DATA_BYTES) {
                throw new HttpError(413, 'too_large', 'Les données dépassent 2 Mo.');
            }
            $base = (int)($in['baseVersion'] ?? -1);
            $pdo = db();
            $pdo->beginTransaction();
            $q = $pdo->prepare('SELECT version FROM user_data WHERE user_id = ? FOR UPDATE');
            $q->execute([$session['id']]);
            $current = (int)($q->fetchColumn() ?: 0);
            if ($base !== $current) {
                $pdo->rollBack();
                throw new HttpError(409, 'version_conflict', 'Les données ont changé sur un autre appareil.', read_data((int)$session['id']));
            }
            $pdo->prepare('INSERT INTO user_data (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE data = VALUES(data), version = VALUES(version), updated_at = VALUES(updated_at)')
                ->execute([$session['id'], $json, $current + 1, now()]);
            $pdo->commit();
            respond(200, ['version' => $current + 1, 'updatedAt' => now() . 'Z']);
    }
    throw new HttpError(404, 'not_found', 'Route inconnue.');
}

function handle(): void
{
    try {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $path = '/' . trim((string)preg_replace('#^/api(?=/|$)#', '', $path), '/');
        route($_SERVER['REQUEST_METHOD'] ?? 'GET', $path);
    } catch (HttpError $e) {
        respond($e->status, ['error' => ['code' => $e->errorCode, 'message' => $e->getMessage()]] + ($e->extra ? ['server' => $e->extra] : []));
    } catch (Throwable $e) {
        error_log('[byhnex-api] ' . $e::class . ': ' . $e->getMessage());
        respond(500, ['error' => ['code' => 'server_error', 'message' => 'Erreur du serveur. Réessayez dans un instant.']]);
    }
}
