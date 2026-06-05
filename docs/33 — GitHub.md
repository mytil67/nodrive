# GitHub

## Dépôt

| Champ | Valeur |
|-------|--------|
| URL | `github.com/mytil67/nodrive` |
| Branche principale | `main` |
| Visibilité | Privé |

## Workflow de déploiement

```
git push origin main
       │
       ▼
Vercel détecte le push (webhook GitHub)
       │
       ▼
npm install && cd frontend && npm install
       │
       ▼
cd frontend && npm run build
  ├── prebuild: bump-version.js (patch++)
  └── vite build → dist/
       │
       ▼
Déploiement production sur nodrive.cc
```

> Pas de CI/CD GitHub Actions — Vercel gère tout via son intégration GitHub native.

## Historique des commits clés

| Hash | Message |
|------|---------|
| `3ae93bd` | Switch to chunked upload for large files (>3.5 MB) |
| `d4b23aa` | Fix chunked download: fetch chunks individually from frontend |
| `862c69d` | Fix 3 critical bugs in chunked download flow |
| `150bb24` | Disable Vercel body parser for binary uploads |
| `dd02f5b` | Security hardening: 6 fixes from full audit |
| `f039a7d` | Multi-file upload/download support + fade animations (v0.3.1) |
| `b1fb266` | Update home feature text: single-use download (v0.3.2) |

## Conventions de commit

```
<Action> <description courte> (vN.N.N)

<Détail>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

- Le numéro de version est inclu quand il change
- Le co-author est Claude quand il a assisté

## Fichiers sensibles (gitignored)

```
.env.local
node_modules/
```

> `frontend/dist/` n'est **pas** gitignored — il est commité et déployé.

## Voir aussi

- [[30 — Vercel]]
- [[52 — Versioning]]
