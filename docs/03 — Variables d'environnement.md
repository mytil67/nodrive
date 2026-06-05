# Variables d'environnement

## Backend (Vercel Environment Variables)

| Variable | Requis | Default | Description |
|----------|--------|---------|-------------|
| `BLOB_READ_WRITE_TOKEN` | **Oui** | — | Token Vercel Blob Storage (lecture/écriture) |
| `CRON_SECRET` | **Oui** | — | Secret pour authentifier les appels cron Vercel |
| `MAX_FILE_SIZE_MB` | Non | `25` | Taille max par transfert en Mo |
| `EXPIRATION_HOURS` | Non | `24` | Durée de vie d'un transfert en heures |
| `MAX_DOWNLOADS` | Non | `1` | Nombre de téléchargements avant suppression |

## Frontend (Variables Vite — préfixe `VITE_`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_MAX_FILE_SIZE_MB` | `25` | Affiché côté client pour validation avant upload |

> **Important** : les variables `VITE_*` sont injectées au build et visibles dans le JS client. Ne jamais y mettre de secret.

## Template `.env.local.example`

```env
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxx
MAX_FILE_SIZE_MB=25
EXPIRATION_HOURS=24
MAX_DOWNLOADS=1
CRON_SECRET=une-chaine-aleatoire-longue

VITE_MAX_FILE_SIZE_MB=25
```

## Où les configurer

- **Local** : fichier `.env.local` à la racine (gitignored)
- **Vercel** : Settings → Environment Variables (Production/Preview/Development)
- **Le `CRON_SECRET`** est automatiquement injecté par Vercel dans les appels cron

## Voir aussi

- [[25 — Endpoint health]] — Vérifie la présence de `BLOB_READ_WRITE_TOKEN`
- [[30 — Vercel]] — Configuration du projet Vercel
