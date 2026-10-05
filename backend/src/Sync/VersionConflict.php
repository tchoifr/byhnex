<?php

declare(strict_types=1);

namespace App\Sync;

/**
 * The stored data changed since the version the device based its changes on.
 */
final class VersionConflict extends \RuntimeException
{
}
