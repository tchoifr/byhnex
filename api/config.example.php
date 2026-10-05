<?php
// Copy to ~/.secrets/byhnex-config.php on the server (outside www/). Never commit the real file.
return [
    'db' => [
        'host' => 'xxxxx.mysql.db',
        'port' => 3306,
        'name' => 'nom_de_la_base',
        'user' => 'utilisateur',
        'password' => 'mot_de_passe',
    ],
    'allowed_origins' => ['https://byhnex.com'],
    'cookie_secure' => true,
];
