# Production byhnex.com

Ce dossier contient tout ce qui est propre à la production sur byhnex.com. Les fichiers maintenus par osvalt16 ne sont pas modifiés, ce qui permet de récupérer ses changements sans conflit.

## Ce qui est en ligne

| Élément | Où | Rôle |
|---|---|---|
| Site | `www/` sur l'hébergement OVH Pro (cluster100) | Les pages du dépôt, construites par `prod/build-prod.mjs` |
| Compte | `account.js` + `sync-core.js` ajoutés à chaque page | Connexion et synchronisation des données du navigateur |
| API | `www/api/` (PHP 8.2) | Comptes, sessions, données synchronisées |
| Base | MySQL 8.4 `byhnexbbyhnexbdd` | Tables `users`, `sessions`, `user_data`, `login_attempts`, `schema_migrations` |
| Configuration | `~/.secrets/byhnex-config.php` sur le serveur, hors de `www/` | Accès à la base. Jamais dans Git. Modèle : `api/config.example.php` |

Données synchronisées : `cryptonite-v1`, `crypto-portfolio-v1`, `byhnex-reserve-eur`, `byhnex-favorites`, `byhnex-devise`, `byhnex-bot-prefs-v1`, `byhnex-bot-mode-v1`. La liste se trouve dans `prod/sync-core.js` et `api/src/app.php` (les deux doivent rester identiques). Les caches, le code personnel du bot et l'état du bot en direct restent sur l'appareil.

## Déploiement

Chaque push sur `main` lance `.github/workflows/deploy-prod.yml` :

1. Tests du site, de la synchronisation et de l'API sur un vrai MySQL 8.4.
2. Build de production dans `dist/`.
3. Copie de secours de la version en ligne dans `~/deploy-previous` sur le serveur.
4. Envoi par rsync vers `www/` (les fichiers absents du build sont supprimés, sauf `googleb4faf05172e6f27a.html` pour Google Search Console).
5. Migrations SQL en attente (`api/bin/migrate.php`).
6. Vérification que byhnex.com sert la nouvelle version et que `/api/health` répond.

Secrets du dépôt (Settings → Secrets and variables → Actions) :

| Secret | Valeur |
|---|---|
| `PROD_SSH_HOST` | `ftp.cluster100.hosting.ovh.net` |
| `PROD_SSH_USER` | identifiant FTP/SSH principal |
| `PROD_WEB_DIR` | `www` |
| `PROD_SSH_KEY` | clé privée de déploiement (recommandé) |
| `PROD_SSH_PASSWORD` | mot de passe SSH, seulement si aucune clé n'est configurée |

L'empreinte du serveur est fixée dans `prod/known_hosts` : la CI refuse de se connecter à un autre serveur.

## Changements d'osvalt16

`.github/workflows/sync-upstream.yml` fusionne chaque matin `osvalt16/byhnex` dans ce fork, puis lance le déploiement. Si la fusion automatique échoue (conflit, ou modification d'un workflow qu'un jeton automatique n'a pas le droit de pousser), cliquez sur **Sync fork** sur la page du dépôt : le push qui en résulte déclenche le déploiement.

## Revenir à la version précédente

```sh
ssh <utilisateur>@ftp.cluster100.hosting.ovh.net
rsync -a --delete ~/deploy-previous/ ~/www/
```

Les migrations ne sont pas annulées automatiquement : écrivez une nouvelle migration si un changement de schéma doit être défait.

## Sauvegardes

- Avant la mise en production du 5 octobre 2026 : `~/backups/` sur le serveur (base de la plateforme freelance et ancien `www/`), copie aussi sur le PC du propriétaire.
- OVH conserve des sauvegardes automatiques de la base (espace client → Bases de données → Restaurer).

## Développer en local

```sh
node --test prod/sync-core.test.mjs
node prod/build-prod.mjs        # construit dist/ comme en production
```

Les tests de l'API demandent PHP 8.2 et MySQL : ils tournent dans la CI.
