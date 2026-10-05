<?php

declare(strict_types=1);

namespace App\Controller;

use App\Account\Credentials;
use App\Api\ApiException;
use App\Api\ApiResponse;
use App\Api\JsonBody;
use App\Entity\AuthSession;
use App\Entity\User;
use App\Repository\AuthSessionRepository;
use App\Repository\UserRepository;
use App\Security\LoginThrottle;
use App\Security\SessionManager;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Clock\ClockInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/auth', name: 'auth_')]
final class AuthController
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly AuthSessionRepository $sessions,
        private readonly SessionManager $sessionManager,
        private readonly LoginThrottle $throttle,
        private readonly UserPasswordHasherInterface $hasher,
        private readonly EntityManagerInterface $em,
        private readonly ClockInterface $clock,
    ) {
    }

    #[Route('/register', name: 'register', methods: ['POST'])]
    public function register(Request $request): JsonResponse
    {
        $in = JsonBody::read($request);
        $email = Credentials::email($in['email'] ?? '');
        $password = Credentials::newPassword($in['password'] ?? '');
        $ip = (string) $request->getClientIp();
        $this->throttle->check(LoginThrottle::REGISTER, $ip, $email);
        $this->throttle->record(LoginThrottle::REGISTER, $ip, $email);
        if (null !== $this->users->findOneByEmail($email)) {
            throw $this->emailTaken();
        }
        $user = new User($email, $this->clock->now());
        $user->setPassword($this->hasher->hashPassword($user, $password));
        try {
            $this->em->persist($user);
            $this->em->flush();
        } catch (UniqueConstraintViolationException) {
            throw $this->emailTaken();
        }
        $response = ApiResponse::json(['user' => self::view($user)], 201);
        $this->sessionManager->start($user, $request, $response);

        return $response;
    }

    #[Route('/login', name: 'login', methods: ['POST'])]
    public function login(Request $request): JsonResponse
    {
        $in = JsonBody::read($request);
        $email = Credentials::email($in['email'] ?? '');
        $password = Credentials::given($in['password'] ?? '');
        $ip = (string) $request->getClientIp();
        $this->throttle->check(LoginThrottle::LOGIN, $ip, $email);
        $user = $this->users->findOneByEmail($email);
        if (null === $user || !$this->hasher->isPasswordValid($user, $password)) {
            $this->throttle->record(LoginThrottle::LOGIN, $ip, $email);
            throw new ApiException(401, 'invalid_credentials', 'Adresse e-mail ou mot de passe incorrect.');
        }
        if ($this->hasher->needsRehash($user)) {
            $user->setPassword($this->hasher->hashPassword($user, $password));
        }
        $response = ApiResponse::json(['user' => self::view($user)]);
        $this->sessionManager->start($user, $request, $response);

        return $response;
    }

    #[Route('/logout', name: 'logout', methods: ['POST'])]
    public function logout(Request $request): JsonResponse
    {
        $response = ApiResponse::json(['ok' => true]);
        $session = $request->attributes->get(SessionManager::ATTRIBUTE);
        $this->sessionManager->revoke($session instanceof AuthSession ? $session : null, $response);

        return $response;
    }

    #[Route('/me', name: 'me', methods: ['GET'])]
    #[IsGranted('IS_AUTHENTICATED')]
    public function me(#[CurrentUser] User $user): JsonResponse
    {
        return ApiResponse::json(['user' => self::view($user)]);
    }

    #[Route('/password', name: 'password', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED')]
    public function password(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $in = JsonBody::read($request);
        if (!$this->hasher->isPasswordValid($user, Credentials::given($in['currentPassword'] ?? ''))) {
            throw new ApiException(401, 'invalid_credentials', 'Mot de passe actuel incorrect.');
        }
        $user->setPassword($this->hasher->hashPassword($user, Credentials::newPassword($in['newPassword'] ?? '')));
        $this->em->flush();
        $current = $request->attributes->get(SessionManager::ATTRIBUTE);
        if ($current instanceof AuthSession) {
            $this->sessions->deleteOthers($user, $current);
        }

        return ApiResponse::json(['ok' => true]);
    }

    /**
     * @return array{email: string, createdAt: string}
     */
    public static function view(User $user): array
    {
        return ['email' => $user->getEmail(), 'createdAt' => $user->getCreatedAt()->format('Y-m-d H:i:s').'Z'];
    }

    private function emailTaken(): ApiException
    {
        return new ApiException(409, 'email_taken', 'Un compte existe déjà avec cette adresse e-mail.');
    }
}
