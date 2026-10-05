<?php

declare(strict_types=1);

namespace App\Payment;

/**
 * A payment that cannot be accepted, with a stable code for the frontend (see docs/paiement.md).
 */
final class PaymentError extends \RuntimeException
{
    public const MESSAGES = [
        'WALLET_NOT_CONNECTED' => 'Connectez un wallet Solana pour payer.',
        'INVALID_WALLET' => 'Adresse de wallet Solana invalide.',
        'PAYMENT_INTENT_NOT_FOUND' => 'Demande de paiement introuvable.',
        'PAYMENT_INTENT_EXPIRED' => 'La demande de paiement a expiré. Relancez le paiement.',
        'TRANSACTION_NOT_FOUND' => 'Transaction introuvable sur Solana.',
        'TRANSACTION_PENDING' => 'Transaction en cours de finalisation sur Solana.',
        'TRANSACTION_FAILED' => 'La transaction a échoué sur Solana : aucun montant n’a été débité pour l’abonnement.',
        'INVALID_SENDER' => 'La transaction ne vient pas du wallet utilisé pour ce paiement.',
        'INVALID_RECIPIENT' => 'La transaction n’est pas adressée au wallet de Byhnex.',
        'INVALID_TOKEN' => 'La transaction n’utilise pas l’USDC officiel.',
        'INVALID_AMOUNT' => 'Le montant de la transaction ne correspond pas au prix de l’abonnement.',
        'INVALID_MEMO' => 'La transaction ne correspond pas à cette demande de paiement.',
        'INVALID_SIGNATURE' => 'Signature de transaction invalide.',
        'PAYMENT_ALREADY_USED' => 'Cette transaction a déjà été utilisée.',
        'INSUFFICIENT_USDC' => 'Solde USDC insuffisant sur ce wallet.',
        'INSUFFICIENT_SOL' => 'Solde SOL insuffisant pour les frais du réseau Solana.',
        'RPC_UNAVAILABLE' => 'Solana ne répond pas pour le moment. La vérification reprendra automatiquement.',
        'PAYMENTS_NOT_CONFIGURED' => 'Les paiements ne sont pas encore ouverts.',
    ];

    public function __construct(public readonly string $errorCode)
    {
        parent::__construct(self::MESSAGES[$errorCode] ?? $errorCode);
    }
}
