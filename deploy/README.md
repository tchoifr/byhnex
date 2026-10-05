# Production byhnex.com

Tout push sur `main` (direct ou par fusion de PR) est testé puis déployé automatiquement par `.github/workflows/deploy-prod.yml`. Architecture : [docs/architecture.md](../docs/architecture.md).

## Ce que fait le déploiement

1. **CI complète** (`ci.yml`) : frontend, backend, contrat de l'API et migrations sur MySQL 8.4, pages d'origine, parité visuelle.
2. **Build** : `npm --prefix frontend run build` puis `node deploy/build.mjs` → `dist/` (pages d'origine + pages Vue, module de compte, `.htaccess`, `api/index.php`) ; `composer install --no-dev` dans `backend/`.
3. **Configuration privée** : au premier déploiement, `deploy/bootstrap-env.php` crée `~/byhnex-api/.env.local` sur le serveur à partir de `~/.secrets/byhnex-config.php` (les secrets ne quittent pas le serveur).
4. **Copie de secours** de la version en ligne dans `~/deploy-previous/` (`www/` et `api/`).
5. **API** : rsync de `backend/` vers `~/byhnex-api/` (hors `var/`, `.env.local`, tests et outils), vidage du cache, migrations Doctrine.
6. **Site** : rsync de `dist/` vers `~/www/` (le fichier de vérification Google Search Console est conservé).
7. **Vérification en ligne** : version servie, module de compte présent, `/api/health` répond.

## Secrets GitHub (Settings → Secrets and variables → Actions)

| Secret | Valeur |
|---|---|
| `PROD_SSH_HOST` | `ftp.cluster100.hosting.ovh.net` |
| `PROD_SSH_USER` | identifiant FTP/SSH principal |
| `PROD_WEB_DIR` | `www` |
| `PROD_SSH_PASSWORD` | mot de passe SSH (ou `PROD_SSH_KEY`, clé privée dédiée, recommandé) |
| `SYNC_TOKEN` | jeton fin limité à `tchoifr/byhnex` (Contents et Workflows en lecture/écriture), pour fusionner automatiquement les commits d'osvalt16 |
| `PLATFORM_SOLANA_WALLET` | adresse **publique** du wallet Solana qui reçoit les abonnements en USDC ([docs/paiement.md](../docs/paiement.md)) |
| `SOLANA_RPC_URL` | URL du RPC Solana mainnet avec sa clé (Helius) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | compte Cloudflare de Byhnex, pour le serveur du bot des abonnés (`bot-server/`) |

L'empreinte du serveur est fixée dans `deploy/known_hosts` : la CI refuse tout autre serveur.

## Configuration privée de l'API (sur le serveur, jamais dans Git)

`~/byhnex-api/.env.local` :

```dotenv
APP_ENV=prod
APP_DEBUG=0
APP_SECRET=<64 caractères hexadécimaux aléatoires>
DATABASE_URL="mysql://<utilisateur>:<mot de passe>@<hôte>.mysql.db:3306/<base>?serverVersion=8.4.11&charset=utf8mb4"
ALLOWED_ORIGINS=https://byhnex.com
SESSION_COOKIE_SECURE=1
```

Le déploiement ajoute `BOT_TOKEN_SECRET_KEY` (clé Ed25519 des codes d'accès au bot, créée sur le serveur) et écrit `~/byhnex-api/.env.prod.local` (`SOLANA_RPC_URL`, `PLATFORM_SOLANA_WALLET`, `BOT_SERVER_URL`) à partir des secrets GitHub, avec `deploy/server-env.php`.

Changer le mot de passe de la base dans OVH impose de mettre à jour `DATABASE_URL` ici, puis de vider le cache : `cd ~/byhnex-api && php bin/console cache:clear --env=prod`.

## Revenir à la version précédente

```sh
ssh <utilisateur>@ftp.cluster100.hosting.ovh.net
rsync -a --delete ~/deploy-previous/www/ ~/www/
rsync -a --delete --exclude=var/ --exclude=.env.local ~/deploy-previous/api/ ~/byhnex-api/
cd ~/byhnex-api && php bin/console cache:clear --env=prod
```

Les migrations ne sont pas annulées automatiquement : si un changement de schéma doit être défait, écrire une nouvelle migration (ou `doctrine:migrations:migrate prev` après vérification).

## Journaux

Erreurs de l'API : `~/byhnex-api/var/log/prod-AAAA-MM-JJ.log` (14 jours).

## Sauvegardes

- 5 octobre 2026, avant la mise en production : `~/backups/` (base de l'ancienne plateforme freelance et ancien `www/`), copie aussi sur le PC du propriétaire.
- OVH conserve des sauvegardes automatiques de la base (espace client → Bases de données → Restaurer).
