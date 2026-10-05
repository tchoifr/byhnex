# Règles de développement Byhnex — pour les IA et les humains

Ce fichier fait foi pour tout travail sur ce dépôt, quel que soit l'outil (Claude, Codex, Copilot, Cursor…) ou la personne. En cas de contradiction avec un autre document (`CONTEXT.md`, anciens commentaires), **ce fichier gagne**.

## 1. Le projet en bref

Byhnex est un ensemble d'outils crypto (cours en direct, signaux, graphiques d'accumulation, bot virtuel, cycles) publié sur **https://byhnex.com**. Rien n'est acheté ni vendu : tout est informatif ou simulé.

| Dossier | Rôle | Technologie |
|---|---|---|
| `frontend/` | Pages migrées et module de compte | Vue 3, TypeScript strict, Vite |
| `backend/` | API `/api` : comptes, sessions, données synchronisées, abonnement au bot (USDC sur Solana) | Symfony 7.4 LTS, PHP 8.2, Doctrine, MySQL 8.4 |
| `deploy/` | Build de production, configuration Apache, empreinte SSH du serveur | Node.js |
| `docs/` | Architecture, migration page par page | Markdown |
| racine (`*.html`, `*.js`, `*.css`) | **Pages d'origine (legacy)**, en cours de migration vers `frontend/` | HTML/JS sans build |
| `bot-worker/`, `worker/`, `scripts/` | Bots et robot d'osvalt16 (Cloudflare, GitHub Actions) | JavaScript |
| `bot-server/` | Serveur du bot des abonnés byhnex.com (Cloudflare, compte Byhnex), au-dessus de `bot-worker/` sans le modifier | JavaScript |

Détails : [docs/architecture.md](docs/architecture.md). État de la migration : [docs/migration.md](docs/migration.md). Abonnement et paiements : [docs/paiement.md](docs/paiement.md).

## 2. Règles absolues

1. **`main` = production, push direct autorisé.** Le propriétaire autorise à pousser directement sur `main`, sans Pull Request : chaque push part en ligne automatiquement après la CI complète. Si la CI échoue, rien n'est déployé et le site en ligne reste en place : corriger puis repousser. Ne jamais réécrire l'historique de `main` (force push et suppression sont bloqués).
2. **Aucun changement visuel ou fonctionnel non demandé.** Une page migrée doit rester identique au pixel près à l'original (test de parité visuelle). Un changement d'interface se fait dans un commit dédié, demandé explicitement.
3. **Aucun ordre réel, aucune clé d'exchange dans le code.** Le bot reste en argent fictif. Seule exception on-chain : le paiement de l'abonnement, signé dans le wallet de la personne. Ne jamais demander ni stocker de clé privée ou de phrase de récupération, ne jamais activer un abonnement sans la vérification on-chain du serveur, ne jamais simuler un paiement hors des tests ([docs/paiement.md](docs/paiement.md)).
4. **Aucun secret dans le dépôt, les logs ou les messages.** Les accès vivent dans les secrets GitHub (`PROD_*`) et sur le serveur (`~/byhnex-api/.env.local`). Ne jamais afficher, copier ou committer un mot de passe, un jeton ou une `DATABASE_URL` réelle.
5. **Données personnelles.** Elles restent dans le navigateur, sauf si l'utilisateur se connecte à son compte : elles vont alors **uniquement** sur l'API Byhnex (`/api`), jamais chez un tiers.
6. **Toujours afficher « Pas un conseil financier »** là où des analyses ou simulations sont présentées.
7. **Pas de nouvelle fonctionnalité dans les pages d'origine** (racine). Le nouveau code va dans `frontend/` ou `backend/`. Seuls les correctifs urgents sont tolérés à la racine, et ils doivent aussi être reportés dans la version Vue si la page est migrée.

## 2 bis. Travail d'osvalt16

osvalt16 continue de développer les pages d'origine dans `osvalt16/byhnex`. Ses commits sont fusionnés automatiquement dans `main` toutes les 10 minutes et partent en production ; **sa version gagne toujours**. Ne jamais annuler ni réécrire ses changements. Une page Vue dont l'original a changé est remplacée automatiquement par sa version jusqu'à mise à jour (voir [docs/migration.md](docs/migration.md)).

## 3. Méthode de travail

1. Partir de `main` à jour : `git switch main && git pull`.
2. Petits commits au format **Conventional Commits**, en français : `feat(front): …`, `fix(api): …`, `refactor(…)`, `test(…)`, `docs(…)`, `ci(…)`, `chore(…)`. Un commit = un changement cohérent.
3. Écrire ou mettre à jour les tests **dans le même commit** que le code.
4. Lancer localement les vérifications de la section 5 **avant de pousser** : un push sur `main` part en production.
5. Pousser sur `main` (`git push origin main`), puis suivre le déploiement dans l'onglet Actions jusqu'à « Vérification en ligne » ; en cas d'échec, corriger et repousser sans attendre.
6. Pour un gros changement risqué, une branche et une Pull Request restent possibles (la CI tourne aussi sur les PR), mais ne sont pas obligatoires.
7. Ne jamais contourner une vérification (`--no-verify`, test désactivé, `@phpstan-ignore`, `eslint-disable` sans justification écrite sur la ligne).

## 4. Conventions de code

**Général**
- Identifiants et commentaires en anglais, textes visibles par l'utilisateur en français (comme l'existant).
- Les commentaires expliquent un choix non évident, pas ce que fait le code.
- Pas de nouvelle dépendance sans justification dans le message de commit. Versions exactes (`frontend/package.json`), `composer.lock` et `package-lock.json` committés.

**Frontend (`frontend/`)**
- TypeScript strict, `<script setup lang="ts">`, composants dans `src/pages/<page>/components/`.
- Logique réutilisable dans `src/composables/` (état réactif) et `src/services/` (appels réseau, calculs purs testables).
- Les composants reproduisent le HTML d'origine (mêmes balises, classes et `id`) : le CSS existant (`byhnex.css`, `web3.css`, `sidebar.css`, `style.css`) reste la source du style tant que la migration n'est pas finie.
- Pas de `v-html`. Pas d'accès direct au DOM quand un `ref` ou une liaison Vue suffit.

**Backend (`backend/`)**
- Contrôleurs fins (`src/Controller/`), règles métier dans des services, accès base dans `src/Repository/`.
- Toute erreur sort au format `{"error": {"code", "message"}}` via `App\Api\ApiException` ; messages en français.
- Le schéma de base ne change **que** par une migration Doctrine (`php bin/console doctrine:migrations:diff`), compatible MySQL 8.4. Ne jamais modifier une migration déjà en production.
- Compatibilité PHP 8.2 obligatoire (le serveur OVH est en 8.2) : PHPStan la vérifie.
- Le contrat de l'API (`backend/tests/Contract/api.test.mjs`) décrit ce que le site attend. Un changement de réponse = mise à jour du test **et** du client (`frontend/src/account/api.ts`) dans le même commit.

## 5. Vérifications obligatoires (identiques à la CI)

```sh
# Frontend
cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build

# Backend (PHP 8.2 + Composer)
cd backend && composer install
vendor/bin/php-cs-fixer fix --dry-run --diff
php bin/console cache:warmup --env=dev && vendor/bin/phpstan analyse
php bin/phpunit

# Pages d'origine et serveur du bot des abonnés
npm test
node --test bot-server/worker.test.mjs

# Parité visuelle des pages migrées (Chromium via Playwright)
npm --prefix frontend run build && node deploy/build.mjs && node deploy/build.mjs --legacy
cd frontend && npx playwright test --project=parity
```

La CI ajoute le contrat de l'API et les migrations sur un vrai MySQL 8.4 (`.github/workflows/ci.yml`).

## 6. Définition de « terminé »

- [ ] Le besoin demandé est couvert, rien de plus.
- [ ] Tests ajoutés ou mis à jour ; toutes les vérifications de la section 5 passent.
- [ ] Aucune différence visuelle sur les pages migrées (parité verte) sauf demande explicite.
- [ ] Pas de secret, pas de donnée personnelle envoyée à un tiers.
- [ ] Documentation à jour si l'architecture, une commande ou un comportement change (`docs/`, ce fichier).
- [ ] Déploiement suivi jusqu’à la vérification en ligne (CI verte, site à jour).

## 7. Migrer une page vers Vue

Suivre [docs/migration.md](docs/migration.md) : une page par commit (ou série de commits), même HTML et mêmes `id`, logique portée en TypeScript avec ses tests, scénario ajouté dans `frontend/tests/visual/cases.ts`, parité visuelle verte sur ordinateur et mobile.

## 8. Production et incidents

- Déploiement : automatique à chaque push sur `main` (`.github/workflows/deploy-prod.yml`) avec copie de secours, migrations et vérification en ligne.
- Retour arrière et sauvegardes : [deploy/README.md](deploy/README.md).
- Ne jamais lancer de commande destructive sur le serveur ou la base (suppression, remise à zéro) sans accord explicite du propriétaire et sauvegarde vérifiée.
