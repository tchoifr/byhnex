# Abonnement au bot : 1 USDC sur Solana pour 30 jours

Le bot serveur de byhnex.com est réservé aux comptes abonnés. Un abonnement coûte 1 USDC (réseau Solana mainnet) pour 30 jours. C'est un paiement unique, sans renouvellement automatique. Payer avant la fin ajoute 30 jours après la date de fin en cours (`expires_at = max(maintenant, expires_at) + 30 jours`).

## Parcours

1. **Page** `abonnement.html` (Vue, `frontend/src/pages/abonnement/`). Le visiteur doit être connecté à son compte Byhnex.
2. **Demande de paiement** `POST /api/subscription/payment-intent` (`{method: "wallet", walletAddress}` ou `{method: "qr"}`). Le serveur fixe :
   - le destinataire (wallet de la plateforme) ;
   - le mint USDC officiel ;
   - le montant en unités atomiques (`1000000`) ;
   - un mémo unique `SUB_<uuid>` ;
   - une référence Solana Pay unique ;
   - une expiration à 15 minutes.

   Pour un wallet, le serveur vérifie aussi les soldes USDC et SOL (`INSUFFICIENT_USDC`, `INSUFFICIENT_SOL`) et fournit un blockhash récent. La clé du RPC reste ainsi sur le serveur.
3. **Wallet** (Wallet Standard : Phantom, Solflare, Backpack, Coinbase Wallet, Trust, OKX, Bitget…). La page construit la transaction suivante (`solana.ts`, bibliothèques auditées noble/scure, sans `@solana/web3.js`) :
   - frais de priorité ;
   - création idempotente du compte USDC de la plateforme ;
   - mémo ;
   - `transferChecked` avec la référence attachée.

   Le wallet l'affiche, la personne la valide, puis le wallet l'envoie.
4. **Téléphone** : QR code Solana Pay (`solana:<wallet>?amount=1&spl-token=<USDC>&reference=…&memo=SUB_…`), ou liens qui rouvrent la page dans le navigateur de Phantom, Solflare ou Backpack.
5. **Vérification** `POST /api/subscription/payment/verify` (`{paymentId, signature}`). Ensuite, `GET /api/subscription/payment/{id}` est interrogé toutes les 4 s : il revérifie la transaction ou la retrouve grâce à la référence (paiements par QR code, ou page fermée juste après la signature).
6. **Accès au bot** `POST /api/bot/token` : code d'accès signé en Ed25519 (identifiant du compte et fin de la période payée). La page `bot.html` (page d'origine d'osvalt16, non modifiée) le reçoit du module de compte (`frontend/src/account/bot-access.ts`), qui le saisit dans son formulaire de connexion. Sans abonnement, un bandeau mène à `abonnement.html`.

## Vérification on-chain (`backend/src/Payment/SolanaTransactionVerifier.php`)

La transaction est lue avec `getTransaction` (`jsonParsed`, commitment `finalized`). L'abonnement n'est activé que si **tout** est vrai :

| Règle | Code d'erreur |
|---|---|
| La signature demandée est bien celle de la transaction | `INVALID_SIGNATURE` |
| `meta.err == null` | `TRANSACTION_FAILED` |
| Transaction finalisée (sinon statut `processing`, puis revérifiée) | `TRANSACTION_PENDING` |
| `blockTime` ≤ expiration de la demande + 2 min | `PAYMENT_INTENT_EXPIRED` |
| Transfert du Token Program vers un compte USDC **possédé par le wallet de la plateforme** | `INVALID_RECIPIENT` |
| Mint = USDC officiel (`EPjFWdd5…Dt1v`) | `INVALID_TOKEN` |
| Montant exact en unités atomiques, et hausse exacte du solde USDC de la plateforme | `INVALID_AMOUNT` |
| Autorité du transfert signataire, et égale au wallet connecté (paiement par wallet) | `INVALID_SENDER` |
| Mémo exact `SUB_<uuid>` de la demande et référence présente (non signataire) | `INVALID_MEMO` |
| Signature jamais utilisée par une autre demande (contrainte UNIQUE en base) | `PAYMENT_ALREADY_USED` |
| Le RPC sert bien le réseau configuré (genesis hash mainnet) | `RPC_UNAVAILABLE` |

Autres codes possibles :

- `PAYMENT_INTENT_NOT_FOUND` (404) ;
- `WALLET_NOT_CONNECTED` et `INVALID_WALLET` ;
- `TRANSACTION_NOT_FOUND` (202, encore invisible sur le réseau) ;
- `PAYMENTS_NOT_CONFIGURED` (503) ;
- `SUBSCRIPTION_REQUIRED` (403, accès au bot) ;
- `too_many_attempts` (429, limites par compte dans `config/packages/rate_limiter.yaml`).

L'activation (`SubscriptionService::activate`) se fait dans une transaction avec verrous sur le compte et la demande. Elle est **idempotente** : la même signature renvoie le même résultat sans ajouter de jours. Le navigateur ne peut rien activer : aucune route n'accepte de statut ou de durée venant de la page.

## Bot des abonnés (`bot-server/`)

C'est un Cloudflare Worker sur le compte Byhnex. Il importe sans le modifier le moteur d'osvalt16 (`bot-worker/byhnex-bot.js`, dont le worker reste intact) et ajoute :

- la vérification du code d'accès avec la **clé publique** seule ;
- `403 SUBSCRIPTION_REQUIRED` sur `/start` et `/resume` après la fin de la période payée ;
- la mise en pause automatique du bot par son alarme à la fin de la période.

La clé privée Ed25519 est créée sur le serveur OVH (`.env.local`, par `deploy/server-env.php`) et n'en sort jamais.

## Mise en service (secrets GitHub de `tchoifr/byhnex`)

| Secret | Valeur |
|---|---|
| `PLATFORM_SOLANA_WALLET` | **adresse publique** du wallet Solana qui reçoit les USDC (jamais sa clé privée ni sa phrase de récupération) |
| `SOLANA_RPC_URL` | URL RPC mainnet avec clé, par exemple Helius : `https://mainnet.helius-rpc.com/?api-key=…` |
| `CLOUDFLARE_API_TOKEN` | jeton Cloudflare, modèle « Edit Cloudflare Workers » |
| `CLOUDFLARE_ACCOUNT_ID` | identifiant du compte Cloudflare (32 caractères hexadécimaux) |

Le déploiement écrit `~/byhnex-api/.env.prod.local` sur le serveur (jamais dans Git), déploie le Worker et publie son adresse dans `bot-config.json`. Tant qu'un réglage manque, la page affiche « Paiements bientôt ouverts » ou « Serveur du bot en cours d'installation », et rien n'est simulé.

Réglages par défaut (`backend/.env`) :

- `SUBSCRIPTION_PRICE_USDC=1.00` ;
- `SUBSCRIPTION_DURATION_DAYS=30` ;
- `PAYMENT_INTENT_TTL_MINUTES=15` ;
- `SOLANA_NETWORK=mainnet-beta`.

Le wallet de la plateforme doit idéalement déjà posséder un compte USDC : il en a un dès qu'il a reçu de l'USDC une fois. Sinon, le premier payeur le crée et paie environ 0,002 SOL de dépôt.

## Tests

- `backend/tests/Unit/SolanaTransactionVerifierTest.php` : vraie transaction mainnet (USDC `transferChecked` + mémo), puis copies modifiées une règle à la fois (montant, token, destinataire, mémo, référence, payeur, signature, échec, expiration, programme, instructions internes).
- `backend/tests/Functional/SubscriptionFlowTest.php` : parcours complet par l'API avec un RPC simulé, en test seulement. Il couvre :
  - activation unique et rejouée ;
  - renouvellement ;
  - finalisation différée ;
  - QR code ;
  - refus ;
  - expiration ;
  - RPC en panne ou sur un autre réseau ;
  - soldes ;
  - confidentialité ;
  - accès au bot.
- `backend/tests/Contract/api.test.mjs` : paiements fermés sans configuration sur MySQL, aucune activation possible depuis le navigateur.
- `bot-server/worker.test.mjs` : codes signés, isolation des comptes, pause à l'échéance, renouvellement, CORS.
- `frontend/tests/unit/solana.test.ts` : dérivation du compte USDC (identique à mainnet) et format de la transaction. La même transaction a aussi été simulée sur mainnet (`simulateTransaction`) sans erreur.

## Journaux et suivi

`~/byhnex-api/var/log/prod-AAAA-MM-JJ.log` contient :

- `Demande de paiement créée` ;
- `Transaction refusée` (avec le code) ;
- `Abonnement prolongé` (avec la signature et la nouvelle échéance) ;
- `RPC Solana indisponible` ;
- `Le RPC Solana ne sert pas le réseau configuré` (critique).

Ces journaux ne contiennent jamais l'URL du RPC (elle porte la clé), aucun secret et aucun code d'accès au bot.

## Limites connues

- Un code d'accès au bot reste lisible jusqu'à la fin de la période payée, même si le compte est supprimé entre-temps. Il ne donne accès qu'au bot de ce compte, en argent fictif.
- Seuls les wallets compatibles Wallet Standard avec `solana:signAndSendTransaction` sont proposés. Les autres passent par le QR code.
