# Structure des fichiers

```
filedrop/
│
├── .env.local.example          # Template des variables d'environnement
├── .gitignore
├── package.json                # Dépendances racine (Vercel)
├── vercel.json                 # Config déploiement + headers + cron
├── middleware.js                # Edge middleware (rate limit, CORS)
│
├── api/                        # Serverless Functions Vercel
│   ├── health.js               # GET /api/health
│   ├── upload/
│   │   └── chunk.js            # POST /api/upload/chunk (multi-fichier, chunked)
│   ├── file/[code]/
│   │   ├── info.js             # GET /api/file/:code/info
│   │   ├── download.js         # GET /api/file/:code/download?file=N&chunk=N
│   │   └── delete.js           # POST /api/file/:code/delete
│   └── cron/
│       └── cleanup.js          # GET /api/cron/cleanup (cron toutes les heures)
│
├── cli/                        # CLI tool (v2.0.0)
│   ├── nodrive.js
│   └── package.json
│
├── tests/                     # Tests Vitest
│   ├── crypto.test.js         # Chiffrement round-trip, salt, code
│   ├── sanitize.test.js       # Sanitisation noms de fichiers
│   ├── auth.test.js           # HMAC auth cron
│   ├── validation.test.js     # Regex, bornes index
│   └── api.test.js            # Intégration endpoints (mock blob)
│
├── frontend/                   # Application React (Vite)
│   ├── index.html              # Template HTML
│   ├── package.json            # Dépendances + scripts + version
│   ├── vite.config.js          # Config Vite + __APP_VERSION__
│   ├── public/
│   │   └── favicon.svg
│   ├── scripts/
│   │   └── bump-version.js     # Auto-incrémentation version (prebuild)
│   ├── dist/                   # Build de production (gitignored? non)
│   └── src/
│       ├── main.jsx            # Point d'entrée React
│       ├── App.jsx             # Router (/, /send, /receive/:code?)
│       ├── index.css           # Styles globaux (variables, composants)
│       ├── api/
│       │   └── client.js       # Client API (upload chunks, getInfo, etc.)
│       ├── components/
│       │   ├── BackButton.jsx  # Bouton retour
│       │   ├── CodeDisplay.jsx # Affichage code + QR + copie + annulation
│       │   ├── DropZone.jsx    # Zone drag & drop multi-fichier
│       │   ├── Footer.jsx      # Footer avec version + langue
│       │   └── ProgressBar.jsx # Barre de progression accessible
│       ├── i18n/
│       │   ├── I18nContext.jsx # Provider React i18n
│       │   └── translations.js # Clés FR/EN
│       ├── pages/
│       │   ├── Home.jsx        # Page d'accueil
│       │   ├── Send.jsx        # Page d'envoi (multi-fichier)
│       │   └── Receive.jsx     # Page de réception (multi-fichier)
│       └── utils/
│           ├── crypto.js       # AES-GCM, PBKDF2, generateTransferCode
│           └── format.js       # formatSize()
│
└── docs/                       # Cette documentation
```

## Conventions de nommage

| Type | Convention | Exemple |
|------|-----------|---------|
| Composants React | PascalCase | `DropZone.jsx` |
| Utilitaires | camelCase | `crypto.js` |
| API endpoints | kebab-case (Vercel route) | `upload/chunk.js` |
| CSS classes | BEM | `.send-progress-card__icon--blue` |
| Variables CSS | `--color-*`, `--radius-*` | `--color-primary` |
| Traductions | `section.element.variant` | `send.encrypting.file` |

## Voir aussi

- [[10 — Frontend overview]]
- [[20 — API overview]]
