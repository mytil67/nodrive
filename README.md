# NoDrive

Transfert de fichiers temporaire chiffré entre deux machines, sans compte, sans installation, depuis le navigateur.

## Fonctionnement

1. **Envoyer** — choisissez un fichier, il est chiffré localement (AES-GCM 256 bits) puis envoyé directement vers Vercel Blob. Un lien de téléchargement est généré, contenant la clé dans le fragment `#` de l'URL (jamais transmise au serveur).
2. **Recevoir** — ouvrez le lien complet sur l'autre machine. Le fichier chiffré est téléchargé puis déchiffré localement dans le navigateur. Le nom et l'extension d'origine sont conservés.

## Sécurité

- Chiffrement **AES-GCM 256 bits** côté navigateur (Web Crypto API)
- La clé ne quitte jamais le navigateur (fragment `#` non envoyé aux serveurs)
- Les fichiers Vercel Blob sont des blobs chiffrés : inutilisables sans la clé
- Codes de transfert courts et non prédictibles (`crypto.getRandomValues`)
- Noms de fichiers nettoyés côté serveur
- Expiration configurable (défaut : 24 h)
- Mode usage unique : suppression automatique après téléchargement

## Architecture

```
nodrive/
├── api/                          # Vercel Serverless Functions
│   ├── upload.js                 # handleUpload — validation + métadonnées
│   ├── file/[code]/
│   │   ├── info.js               # GET — infos publiques du transfert
│   │   └── delete.js             # POST — suppression blob + métadonnée
│   └── cron/
│       └── cleanup.js            # Nettoyage quotidien des fichiers expirés
├── frontend/                     # React + Vite
│   └── src/
│       ├── pages/                # Home, Send, Receive
│       ├── components/           # DropZone, ProgressBar, CodeDisplay
│       ├── api/client.js         # Appels API + upload @vercel/blob/client
│       └── utils/crypto.js       # AES-GCM (Web Crypto API)
├── vercel.json                   # Build, rewrites SPA, cron
└── package.json                  # Dépendances des Functions
```

Stockage Vercel Blob :
- `transfers/{CODE}/file.enc` — fichier chiffré
- `metadata/{CODE}.json` — métadonnées (sans clé)

## Développement local

```bash
# 1. Installer les dépendances
npm install
cd frontend && npm install && cd ..

# 2. Lier le projet Vercel et récupérer les variables d'environnement
vercel link
vercel env pull .env.local

# 3. Démarrer (frontend + API sur le même port)
vercel dev
```

## Déploiement

```bash
vercel --prod
```

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | — | Injecté par Vercel Blob (connexion via Dashboard) |
| `MAX_FILE_SIZE_MB` | `25` | Taille maximale par fichier (Mo) |
| `EXPIRATION_HOURS` | `24` | Durée de vie des transferts |
| `MAX_DOWNLOADS` | `1` | Nombre de téléchargements autorisés |
| `CRON_SECRET` | — | Secret pour sécuriser le endpoint `/api/cron/cleanup` |
| `VITE_MAX_FILE_SIZE_MB` | `25` | Idem, exposé au frontend |
| `VITE_EXPIRATION_HOURS` | `24` | Idem, exposé au frontend |
