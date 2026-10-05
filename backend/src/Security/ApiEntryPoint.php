<?php

declare(strict_types=1);

namespace App\Security;

use App\Api\ApiException;
use App\Api\ApiResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Http\EntryPoint\AuthenticationEntryPointInterface;

/**
 * Anonymous requests to routes that need an account get the API's 401 error.
 */
final class ApiEntryPoint implements AuthenticationEntryPointInterface
{
    public function start(Request $request, ?AuthenticationException $authException = null): Response
    {
        return ApiResponse::error(new ApiException(401, 'not_authenticated', 'Connectez-vous pour continuer.'));
    }
}
