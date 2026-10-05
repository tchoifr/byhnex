<?php

declare(strict_types=1);

namespace App\Controller;

use App\Account\Credentials;
use App\Api\ApiException;
use App\Api\ApiResponse;
use App\Api\JsonBody;
use App\Entity\User;
use App\Security\SessionManager;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class AccountController
{
    /**
     * Deletes the account; sessions and synced data go with it (ON DELETE CASCADE).
     */
    #[Route('/account', name: 'account_delete', methods: ['DELETE'])]
    #[IsGranted('IS_AUTHENTICATED')]
    public function delete(
        Request $request,
        #[CurrentUser] User $user,
        UserPasswordHasherInterface $hasher,
        EntityManagerInterface $em,
        SessionManager $sessions,
    ): JsonResponse {
        $in = JsonBody::read($request);
        if (!$hasher->isPasswordValid($user, Credentials::given($in['password'] ?? ''))) {
            throw new ApiException(401, 'invalid_credentials', 'Mot de passe incorrect.');
        }
        $em->getConnection()->delete('users', ['id' => $user->getId()]);
        $response = ApiResponse::json(['ok' => true]);
        $sessions->revoke(null, $response);

        return $response;
    }
}
