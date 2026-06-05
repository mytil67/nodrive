# NoDrive

Transfert de fichiers temporaire et chiffré entre deux machines — sans compte, sans installation, depuis le navigateur.

**[→ nodrive.vercel.app](https://nodrive.vercel.app)** · dev by [@mytil](https://github.com/mytil67)

---

## Principe

1. **Expéditeur** — dépose un fichier, choisit un mot de passe → obtient un code à 6 caractères
2. **Destinataire** — va sur le site, saisit le code + le mot de passe → télécharge le fichier déchiffré

Aucun lien long à copier-coller. Deux informations courtes à transmettre oralement ou par message.

---

## Sécurité

| Mécanisme | Détail |
|---|---|
| **Chiffrement** | AES-256-GCM, effectué dans le navigateur (Web Crypto API) |
| **Dérivation de clé** | PBKDF2 / SHA-256 / 200 000 itérations |
| **Sel** | 128 bits aléatoires générés par transfert (stockés dans les métadonnées, pas secret) |
| **Clé** | Jamais transmise au serveur — dérivée localement côté expéditeur et destinataire |
| **Stockage** | Blobs privés Vercel (inaccessibles sans token serveur) |
| **Suppression** | Automatique côté serveur après le premier téléchargement ou après expiration |
| **Annulation** | L'expéditeur reçoit un `deleteToken` 128 bits pour supprimer son transfert |
| **Rate limiting** | Vercel Edge Middleware — 5 uploads/min, 30 req/min sur les autres endpoints |
| **Headers HTTP** | CSP, X-Frame-Options DENY, HSTS preload, X-Content-Type-Options, Referrer-Policy |

Le serveur ne voit jamais le mot de passe ni la clé de déchiffrement.

---

## Stack

| Couche | Technologie |
|---|---|
| Frontend | React 18 + Vite + React Router |
| Backend | Vercel Serverless Functions (Node.js ESM) |
| Stockage | Vercel Blob (accès privé) |
| Edge | Vercel Edge Middleware (`@vercel/edge`) |
| Déploiement | Vercel |

---

## Structure

```
/
├── api/
│   ├── upload.js                 POST /api/upload
│   ├── health.js                 GET  /api/health
│   ├── cron/cleanup.js           GET  /api/cron/cleanup
│   └── file/[code]/
│       ├── info.js               GET  /api/file/:code/info
│       ├── download.js           GET  /api/file/:code/download
│       └── delete.js             POST /api/file/:code/delete  (deleteToken requis)
├── frontend/
│   └── src/
│       ├── pages/                Home · Send · Receive
│       ├── components/           BackButton · CodeDisplay · DropZone · Footer · ProgressBar
│       ├── api/client.js         Couche HTTP (XHR upload, fetch info/download/cancel)
│       └── utils/crypto.js       AES-GCM · PBKDF2 · generateSalt
├── middleware.js                 Rate limiting (Vercel Edge)
└── vercel.json                   Routing SPA · Security headers · Cron
```

Stockage Vercel Blob :
- `transfers/{CODE}/file.enc` — fichier chiffré (binaire brut)
- `metadata/{CODE}.json` — métadonnées publiques (nom, taille, sel, expiration) — sans clé ni mot de passe

---

## Installation locale

```bash
git clone https://github.com/mytil67/nodrive.git
cd nodrive
npm install
cd frontend && npm install && cd ..

# Lier au projet Vercel et récupérer les variables d'environnement
vercel link
vercel env pull .env.local

# Démarrer (frontend + API sur le même port)
vercel dev
```

> Ne pas utiliser `npm run dev` depuis `frontend/` seul — les routes `/api` ne seraient pas disponibles.

## Déploiement

```bash
vercel --prod
```

Le script `prebuild` incrémente automatiquement le numéro de patch dans `frontend/package.json` à chaque build.

---

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | — | Injecté automatiquement par Vercel Blob (connexion via Dashboard) |
| `CRON_SECRET` | — | Secret pour sécuriser `/api/cron/cleanup` (`openssl rand -hex 32`) |
| `MAX_FILE_SIZE_MB` | `4` | Taille maximale par fichier (Mo) |
| `EXPIRATION_HOURS` | `24` | Durée de vie des transferts (heures) |
| `MAX_DOWNLOADS` | `1` | Nombre de téléchargements autorisés par transfert |
| `VITE_MAX_FILE_SIZE_MB` | `25` | Idem, exposé au frontend pour validation côté client |

---

## Limitations

- **Taille max** : ~4 Mo par défaut (limite infrastructure Vercel Serverless). Configurable via `MAX_FILE_SIZE_MB`.
- **Rate limiting** : compteur in-memory par instance edge (best-effort, pas distribué). Pour un rate-limiting précis, connecter un store `@vercel/kv`.
- **Usage unique** : `MAX_DOWNLOADS=1` par défaut. Modifiable si nécessaire.

---

## CLI

Un outil en ligne de commande est disponible dans le dossier `cli/`. Il utilise la même cryptographie (AES-256-GCM + PBKDF2) et appelle l'API déployée. Aucune dépendance — Node.js ≥ 18 suffit.

### Installation

```bash
# Usage direct (sans installation)
npx nodrive-cli send fichier.pdf

# Installation globale
npm install -g nodrive-cli
nodrive send fichier.pdf
```

### Commandes

```bash
# Envoyer un fichier
nodrive send rapport.pdf -p "monmotdepasse"
#   Code          : AB3K7P
#   Mot de passe  : monmotdepasse
#   Delete token  : a3f9...

# Recevoir un fichier
nodrive receive AB3K7P -p "monmotdepasse"
nodrive receive AB3K7P -p "monmotdepasse" -o ~/Downloads

# Annuler un transfert (avant téléchargement)
nodrive cancel AB3K7P --token a3f9...

# Pointeur vers une instance custom
nodrive send fichier.zip -p "pass" --url https://mon-instance.vercel.app
```

### Publication npm

```bash
cd cli
npm publish --access public
```

---

## Licence

MIT
