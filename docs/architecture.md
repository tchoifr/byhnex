# Architecture

## Vue d'ensemble

```
Navigateur ──► https://byhnex.com/            pages (www/ sur OVH)
           │      ├─ pages Vue (frontend/)    ex. index.html
           │      ├─ pages d'origine (racine) ex. accumulation.html
           │      └─ assets/account-*.js      compte + synchronisation, sur toutes les pages
           │
           ├──► https://byhnex.com/api/*      API Symfony (backend/)
           │        www/api/index.php ──► ~/byhnex-api/ (code, vendor, .env.local)
           │                                  └─► MySQL 8.4 (OVH)
           │
           └──► APIs publiques de marché      Coinbase, Binance, CoinGecko, Alternative.me…
```

## Frontend — `frontend/`

- **Vite multi-pages** : chaque fichier `frontend/pages/<nom>.html` devient `<nom>.html` en production, à la même URL que la page d'origine qu'il remplace.
- **Vue 3 + TypeScript strict.** Une page = un dossier `src/pages/<page>/` (point d'entrée `main.ts`, composant racine, `components/`).
- **Partagé** : `src/composables/` (état réactif : favoris, flux de marché, contexte de marché), `src/services/` (appels réseau et calculs purs), `src/account/` (compte et synchronisation).
- **Style** : les feuilles CSS d'origine (`byhnex.css`, `web3.css`, `sidebar.css`, `style.css`) restent la référence pendant la migration ; les composants reproduisent leur HTML.
- **Navigation** : la barre latérale reste le script d'origine `sidebar.js`, importé par les pages Vue, jusqu'à sa propre migration.
- **Tests** : Vitest (`tests/unit/`) pour la logique ; Playwright (`tests/visual/`) pour la parité visuelle avec la page d'origine.

## Backend — `backend/`

- **Symfony 7.4 LTS**, PHP 8.2 (version du serveur), Doctrine ORM et Migrations, MySQL 8.4.
- **Routes** (`src/Controller/`) : `GET /health`, `POST /auth/register|login|logout|password`, `GET /auth/me`, `DELETE /account`, `GET|PUT /data`.
- **Sessions** : jeton aléatoire dans un cookie `byhnex_session` (HttpOnly, Secure, SameSite=Lax, chemin `/api`), seule son empreinte SHA-256 est stockée (table `sessions`), expiration glissante de 30 jours (`src/Security/`).
- **Protection** : les écritures exigent l'en-tête `X-Requested-With: byhnex` et une origine autorisée (`ALLOWED_ORIGINS`) ; limitation des inscriptions et connexions échouées par IP et par e-mail (`LoginThrottle`).
- **Synchronisation** : `user_data` stocke un objet JSON clé → valeur `localStorage` avec un numéro de version ; une écriture n'est acceptée que si la version de base correspond (sinon 409 et données du serveur). Le navigateur fusionne clé par clé (`frontend/src/account/sync-core.ts`).
- **Tests** : PHPUnit (unitaires et fonctionnels sur SQLite), contrat HTTP (`tests/Contract/api.test.mjs`) et migrations sur MySQL 8.4 dans la CI.

## Production — hébergement OVH Pro (cluster100)

| Chemin serveur | Contenu |
|---|---|
| `~/www/` | Site byhnex.com (sortie de `deploy/build.mjs`), dont `api/index.php` |
| `~/byhnex-api/` | Application Symfony (hors du web) ; `.env.local` privé, `var/` (cache, logs) |
| `~/deploy-previous/` | Version précédente du site et de l'API (retour arrière) |
| `~/backups/` | Sauvegardes ponctuelles (base, ancien site) |

Déploiement : `.github/workflows/deploy-prod.yml` (voir [deploy/README.md](../deploy/README.md)).

## Dépôts

- `tchoifr/byhnex` : fork de travail ; `main` est déployé sur byhnex.com.
- `osvalt16/byhnex` : dépôt d'origine (GitHub Pages, bots). La migration lui est proposée ; en attendant, la synchronisation automatique est coupée.
