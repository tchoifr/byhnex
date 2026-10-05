<?php
// Router for `php -S` in CI: /api/* goes to the API like Apache's rewrite rule, the rest is static.
if (preg_match('#^/api(/|$)#', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '')) {
    require __DIR__ . '/../api/index.php';
    return true;
}
return false;
