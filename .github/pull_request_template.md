## Ce qui change

<!-- Pour l'utilisateur du site, en une ou deux phrases. -->

## Type

- [ ] Nouvelle fonctionnalité
- [ ] Correctif
- [ ] Migration d'une page vers Vue
- [ ] Refactorisation sans changement visible
- [ ] CI, documentation, outillage

## Vérifications (voir AGENTS.md, section 5)

- [ ] Frontend : lint, types, tests unitaires, build
- [ ] Backend : PHP-CS-Fixer, PHPStan, PHPUnit
- [ ] Pages d'origine : `npm test`
- [ ] Parité visuelle des pages migrées verte (ou changement visuel demandé explicitement)
- [ ] Migration Doctrine ajoutée si le schéma change ; contrat d'API mis à jour si une réponse change
- [ ] Aucun secret, aucune donnée personnelle envoyée à un tiers
- [ ] Documentation à jour (`docs/`, `AGENTS.md`)

## Risques et retour arrière

<!-- Ce qui pourrait casser en production et comment revenir en arrière. -->
