# Frontend overview

## Stack

| Technologie | Version | Rôle |
|-------------|---------|------|
| React | 18.3.x | UI framework |
| React Router | 6.24.x | Routing SPA |
| Vite | 5.3.x | Bundler + dev server |
| lean-qr | 2.7.x | Génération QR code (SVG) |
| Web Crypto API | native | Chiffrement AES-GCM + PBKDF2 |

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | `Home.jsx` | Accueil avec features et liens |
| `/send` | `Send.jsx` | Upload multi-fichier + chiffrement |
| `/receive` | `Receive.jsx` | Saisie code + téléchargement |
| `/receive/:code` | `Receive.jsx` | Pré-rempli via QR code ou lien |

## Architecture des composants

```
App.jsx
├── Home.jsx
│   └── Footer.jsx
├── Send.jsx
│   ├── BackButton.jsx
│   ├── DropZone.jsx          ← multi-fichier, drag & drop
│   ├── ProgressBar.jsx
│   └── CodeDisplay.jsx       ← code + QR + copie + annulation
└── Receive.jsx
    ├── BackButton.jsx
    └── ProgressBar.jsx
```

## Build

```bash
cd frontend
npm run build    # exécute prebuild (bump version) puis vite build
```

Le script `prebuild` appelle `scripts/bump-version.js` qui incrémente automatiquement le patch version dans `package.json`.

La variable globale `__APP_VERSION__` est injectée par Vite via `vite.config.js` et affichée dans le `Footer.jsx`.

## Développement

```bash
# Full-stack avec Vercel (recommandé)
vercel dev

# Frontend seul (sans API)
cd frontend && npm run dev
```

> `vercel dev` est nécessaire pour que les appels `/api/*` fonctionnent localement.

## Voir aussi

- [[11 — Chiffrement côté client]]
- [[12 — Upload multi-fichier]]
- [[14 — UX & Animations]]
- [[15 — Internationalisation]]
