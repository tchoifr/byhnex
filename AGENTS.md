# Règles de développement Byhnex — pour les IA et les humains

Ce fichier fait foi pour tout travail sur ce dépôt, quel que soit l'outil (Claude, Codex, Copilot, Cursor…) ou la personne. En cas de contradiction avec un autre document (`CONTEXT.md`, anciens commentaires), **ce fichier gagne**.

## 1. Le projet en bref

Byhnex est un ensemble d'outils crypto (cours en direct, signaux, graphiques d'accumulation, bot virtuel, cycles) publié sur **https://byhnex.com**. Rien n'est acheté ni vendu : tout est informatif ou simulé.

| Dossier | Rôle | Technologie |
|---|---|---|
| `frontend/` | Pages migrées et module de compte | Vue 3, TypeScript strict, Vite |
| `backend/` | API `/api` : comptes, sessions, données synchronisées | Symfony 7.4 LTS, PHP 8.2, Doctrine, MySQL 8.4 |
| `deploy/` | Build de production, configuration Apache, empreinte SSH du serveur | Node.js |
| `docs/` | Architecture, migration page par page | Markdown |
| racine (`*.html`, `*.js`, `*.css`) | **Pages d'origine (legacy)**, en cours de migration vers `frontend/` | HTML/JS sans build |
| `bot-worker/`, `worker/`, `scripts/` | Bots et robot d'osvalt16 (Cloudflare, GitHub Actions) | JavaScript |

Détails : [docs/architecture.md](docs/architecture.md). État de la migration : [docs/migration.md](docs/migration.md).

## 2. Règles absolues

1. **`main` = production.** Tout merge dans `main` part en ligne automatiquement. Personne ne pousse directement sur `main` : une branche, une Pull Request, la CI au vert, une relecture.
2. **Aucun changement visuel ou fonctionnel non demandé.** Une page migrée doit rester identique au pixel près à l'original (test de parité visuelle). Un changement d'interface se fait dans une PR dédiée, demandée explicitement.
3. **Aucun ordre réel, aucune clé d'exchange dans le code.** Le site n'exécute aucune transaction.
4. **Aucun secret dans le dépôt, les logs ou les messages.** Les accès vivent dans les secrets GitHub (`PROD_*`) et sur le serveur (`~/byhnex-api/.env.local`). Ne jamais afficher, copier ou committer un mot de passe, un jeton ou une `DATABASE_URL` réelle.
5. **Données personnelles.** Elles restent dans le navigateur, sauf si l'utilisateur se connecte à son compte : elles vont alors **uniquement** sur l'API Byhnex (`/api`), jamais chez un tiers.
6. **Toujours afficher « Pas un conseil financier »** là où des analyses ou simulations sont présentées.
7. **Pas de nouvelle fonctionnalité dans les pages d'origine** (racine). Le nouveau code va dans `frontend/` ou `backend/`. Seuls les correctifs urgents sont tolérés à la racine, et ils doivent aussi être reportés dans la version Vue si la page est migrée.

## 3. Méthode de travail

1. Partir de `main` à jour : `git switch main && git pull && git switch -c <type>/<sujet-court>` (ex. `feat/page-cycles-vue`, `fix/api-session-expiree`).
2. Petits commits au format **Conventional Commits**, en français : `feat(front): …`, `fix(api): …`, `refactor(…)`, `test(…)`, `docs(…)`, `ci(…)`, `chore(…)`. Un commit = un changement cohérent.
3. Écrire ou mettre à jour les tests **dans le même commit** que le code.
4. Lancer localement les vérifications de la section 5 avant de pousser.
5. Ouvrir une PR vers `main` en remplissant le modèle (`.github/pull_request_template.md`). Décrire ce qui change pour l'utilisateur, comment c'est testé, et les risques.
6. Ne jamais contourner une vérification (`--no-verify`, test désactivé, `@phpstan-ignore`, `eslint-disable` sans justification écrite sur la ligne).

## 4. Conventions de code

**Général**
- Identifiants et commentaires en anglais, textes visibles par l'utilisateur en français (comme l'existant).
- Les commentaires expliquent un choix non évident, pas ce que fait le code.
- Pas de nouvelle dépendance sans justification dans la PR. Versions exactes (`frontend/package.json`), `composer.lock` et `package-lock.json` committés.

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
- Le contrat de l'API (`backend/tests/Contract/api.test.mjs`) décrit ce que le site attend. Un changement de réponse = mise à jour du test **et** du client (`frontend/src/account/api.ts`) dans la même PR.

## 5. Vérifications obligatoires (identiques à la CI)

```sh
# Frontend
cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build

# Backend (PHP 8.2 + Composer)
cd backend && composer install
vendor/bin/php-cs-fixer fix --dry-run --diff
php bin/console cache:warmup --env=dev && vendor/bin/phpstan analyse
php bin/phpunit

# Pages d'origine
npm test

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
- [ ] PR relue et CI verte avant le merge.

## 7. Migrer une page vers Vue

Suivre [docs/migration.md](docs/migration.md) : une page par PR, même HTML et mêmes `id`, logique portée en TypeScript avec ses tests, scénario ajouté dans `frontend/tests/visual/cases.ts`, parité visuelle verte sur ordinateur et mobile.

## 8. Production et incidents

- Déploiement : automatique au merge dans `main` (`.github/workflows/deploy-prod.yml`) avec copie de secours, migrations et vérification en ligne.
- Retour arrière et sauvegardes : [deploy/README.md](deploy/README.md).
- Ne jamais lancer de commande destructive sur le serveur ou la base (suppression, remise à zéro) sans accord explicite du propriétaire et sauvegarde vérifiée.
