# Claude Code

Lis et applique **[AGENTS.md](AGENTS.md)** avant toute tâche : il fait foi pour ce dépôt (architecture, push direct sur `main` = production, conventions, vérifications obligatoires, définition de « terminé »).

Rappels propres à Claude Code :

- Tu peux pousser directement sur `main` (autorisation du propriétaire) : c’est la production. Lance d’abord les vérifications, puis suis le déploiement jusqu’à la vérification en ligne.
- Lance les vérifications de la section 5 d'AGENTS.md avant de déclarer une tâche terminée, et rapporte leur résultat réel.
- Pour un changement d'interface, demande d'abord s'il est voulu : par défaut, le rendu doit rester identique (parité visuelle).
- N'affiche jamais un secret lu dans un fichier `.env`, `.env.local` ou un secret GitHub ; masque-le dans tes sorties.
- `CONTEXT.md` décrit les pages d'origine et les règles métier d'osvalt16 ; ses règles techniques (« pas de build, pas de framework ») ne s'appliquent plus au nouveau code.
