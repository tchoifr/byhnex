<?php

// Serves the API under /api like production: php -S 127.0.0.1:8080 bin/dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', \PHP_URL_PATH) ?: '/';
if (!preg_match('#^/api(/|$)#', $path)) {
    http_response_code(404);
    echo 'Seule l\'API (/api) est servie ici.';

    return true;
}
// The built-in server does not copy environment variables into $_SERVER for requests.
foreach (['APP_ENV', 'APP_DEBUG', 'DATABASE_URL', 'ALLOWED_ORIGINS', 'SESSION_COOKIE_SECURE'] as $name) {
    if (false !== getenv($name)) {
        $_SERVER[$name] = getenv($name);
    }
}
$_SERVER['SCRIPT_NAME'] = $_SERVER['PHP_SELF'] = '/api/index.php';
$_SERVER['SCRIPT_FILENAME'] = __DIR__.'/../public/index.php';

require $_SERVER['SCRIPT_FILENAME'];
