<?php

// Front controller of the Symfony API on byhnex.com, published as www/api/index.php.
// The application itself (code, vendor, configuration) lives outside the web root, in ~/byhnex-api/.

use App\Kernel;

require_once dirname(__DIR__, 2).'/byhnex-api/vendor/autoload_runtime.php';

return static function (array $context): Kernel {
    return new Kernel($context['APP_ENV'], (bool) $context['APP_DEBUG']);
};
