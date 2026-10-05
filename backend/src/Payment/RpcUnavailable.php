<?php

declare(strict_types=1);

namespace App\Payment;

/**
 * The Solana RPC did not answer usefully. Never turns a payment into "confirmed": it stays "processing".
 */
final class RpcUnavailable extends \RuntimeException
{
}
