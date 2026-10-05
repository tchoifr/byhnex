<?php
// API configuration for CI tests (MySQL service container, plain HTTP on localhost).
return [
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => (int)(getenv('DB_PORT') ?: 3306),
        'name' => getenv('DB_NAME') ?: 'byhnex_test',
        'user' => getenv('DB_USER') ?: 'root',
        'password' => getenv('DB_PASSWORD') ?: 'root',
    ],
    'allowed_origins' => ['http://127.0.0.1:8080'],
    'cookie_secure' => false,
];
