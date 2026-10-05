# Migration des pages vers Vue

Objectif : chaque page d'origine (racine du dépôt) est réécrite en Vue 3 + TypeScript dans `frontend/`, **sans aucun changement visible ni fonctionnel**, une page par Pull Request.

## État

| Page | Fichiers d'origine | État |
|---|---|---|
| Accueil | `index.html`, `home.js` | ✅ Migrée (`frontend/src/pages/home/`), parité ordinateur et mobile |
| Graphiques & accumulation | `accumulation.html`, `app.js`, `chart-*.js`, `strategy.js`, `portfolio.js` | À faire |
| Signaux & positionnement | `signaux-crypto.html` | À faire |
| Bot virtuel | `bot.html`, `bot-engine.js` | À faire |
| Cycles & Rainbow | `cycles.html` | À faire |
| Dashboard marché | `crypto-dashboard.html` | À faire |
| Backtest | `backtest.html` | À faire |
| Barre latérale | `sidebar.js`, `sidebar.css` | À faire en dernier (utilisée par toutes les pages) |
| Redirections | `positionnement.html`, `rainbow-*.html`, `saisonnalite-btc.html`, `crypto-bot-virtuel.html` | À remplacer par des redirections 301 dans `deploy/htaccess` |

Tant qu'une page d'origine sert de référence au test de parité, **elle reste dans le dépôt** : si elle change (correctif d'osvalt16 par exemple), le test échoue et signale que la version Vue doit suivre.

## Procédure pour une page

1. **Branche** : `feat/page-<nom>-vue`.
2. **HTML d'entrée** : `frontend/pages/<nom>.html`, avec exactement le même `<head>` que l'original (titre, SEO, icônes, polices, feuilles CSS) et un `<main>` vide comme point de montage.
3. **Composants** : `frontend/src/pages/<nom>/` — reproduire le HTML d'origine à l'identique (balises, classes, `id`, attributs ARIA, textes). Découper en composants lisibles.
4. **Logique** : porter le JavaScript en TypeScript dans des composables et services ; les calculs purs ont leurs tests Vitest.
5. **Scénario de parité** : ajouter la page dans `frontend/tests/visual/cases.ts` avec ses interactions principales (filtres, saisies, boutons), sur ordinateur et mobile.
6. **Données de test** : `npm run test:visual:record` (enregistre les réponses réseau réelles dans `tests/visual/fixtures/<nom>.har`), puis vérifier que le fichier ne contient aucune donnée personnelle.
7. **Parité** : `npx playwright test --project=parity` doit être vert (aucun pixel différent au-delà du lissage, même texte affiché). En cas d'échec, les images « origine », « vue » et « differences » sont dans `frontend/test-results/`.
8. **PR** avec les vérifications d'AGENTS.md ; mettre à jour le tableau ci-dessus.

## Fin de la migration

Quand toutes les pages et la barre latérale sont en Vue :

1. Remplacer la comparaison avec l'original par des captures de référence générées dans la CI (Linux).
2. Supprimer les fichiers d'origine de la racine et `build-pages.js`/`public-files.js`.
3. Déplacer les styles d'origine dans `frontend/src/styles/`.
