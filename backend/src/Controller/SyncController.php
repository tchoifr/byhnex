<?php

declare(strict_types=1);

namespace App\Controller;

use App\Api\ApiException;
use App\Api\ApiResponse;
use App\Api\JsonBody;
use App\Entity\User;
use App\Entity\UserData;
use App\Repository\UserDataRepository;
use App\Sync\SyncKeys;
use App\Sync\VersionConflict;
use Psr\Clock\ClockInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/data', name: 'data_')]
#[IsGranted('IS_AUTHENTICATED')]
final class SyncController
{
    public function __construct(
        private readonly UserDataRepository $data,
        private readonly ClockInterface $clock,
    ) {
    }

    #[Route('', name: 'read', methods: ['GET'])]
    public function read(#[CurrentUser] User $user): JsonResponse
    {
        return ApiResponse::json(self::view($this->data->findForUser($user)));
    }

    #[Route('', name: 'write', methods: ['PUT'])]
    public function write(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $in = JsonBody::read($request);
        $json = SyncKeys::encode($in['data'] ?? null);
        $base = isset($in['baseVersion']) && is_numeric($in['baseVersion']) ? (int) $in['baseVersion'] : -1;
        $now = $this->clock->now();
        try {
            $version = $this->data->save($user, $json, $base, $now);
        } catch (VersionConflict) {
            throw new ApiException(409, 'version_conflict', 'Les données ont changé sur un autre appareil.', self::view($this->data->findForUser($user)));
        }

        return ApiResponse::json(['version' => $version, 'updatedAt' => $now->format('Y-m-d H:i:s').'Z']);
    }

    /**
     * @return array{version: int, updatedAt: ?string, data: ?object}
     */
    private static function view(?UserData $row): array
    {
        if (null === $row) {
            return ['version' => 0, 'updatedAt' => null, 'data' => null];
        }
        $data = json_decode($row->getData(), false, 512, \JSON_THROW_ON_ERROR);

        return [
            'version' => $row->getVersion(),
            'updatedAt' => $row->getUpdatedAt()->format('Y-m-d H:i:s').'Z',
            'data' => \is_object($data) ? $data : new \stdClass(),
        ];
    }
}
