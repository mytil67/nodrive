# API overview

## Architecture

Les endpoints API sont des **Vercel Serverless Functions** (Node.js). Chaque fichier dans `api/` correspond à une route.

## Endpoints

| Méthode | Route | Fichier | Description |
|---------|-------|---------|-------------|
| GET | `/api/health` | `api/health.js` | Health check |
| POST | `/api/upload/chunk` | `api/upload/chunk.js` | Upload d'un chunk |
| GET | `/api/file/:code/info` | `api/file/[code]/info.js` | Métadonnées du transfert |
| GET | `/api/file/:code/download` | `api/file/[code]/download.js` | Téléchargement d'un chunk |
| POST | `/api/file/:code/delete` | `api/file/[code]/delete.js` | Suppression par l'expéditeur |
| GET | `/api/cron/cleanup` | `api/cron/cleanup.js` | Nettoyage planifié |

## Paramètres dynamiques

Le `:code` dans les routes est un code de transfert à 6 caractères.
- Format : `[A-Z2-9]{6}` (regex validée côté serveur)
- Vercel route param : `[code]` (nom du dossier)

## Headers communs

### Upload

| Header | Description |
|--------|-------------|
| `x-blob-code` | Code de transfert |
| `x-chunk-index` | Index du chunk (0-based) |
| `x-chunk-total` | Nombre total de chunks pour ce fichier |
| `x-file-index` | Index du fichier (0-based) |
| `x-file-total` | Nombre total de fichiers |
| `x-blob-salt` | Salt PBKDF2 (dernier chunk uniquement) |
| `x-blob-files` | JSON métadonnées fichiers (dernier chunk uniquement) |

### Delete

| Header | Description |
|--------|-------------|
| `x-delete-token` | Token hex 128 bits reçu lors de l'upload |

## Authentification

- **Aucune auth utilisateur** — le système est anonyme
- **Cron** : `Authorization: Bearer {CRON_SECRET}` (injecté par Vercel)
- **Delete** : `x-delete-token` (comparaison timing-safe)
- **Blob Storage** : `BLOB_READ_WRITE_TOKEN` (côté serveur uniquement)

## Limites Vercel Serverless

| Limite | Valeur | Impact |
|--------|--------|--------|
| Body request | 4.5 Mo | → chunks de 3.5 Mo |
| Body response | 4.5 Mo | → download par chunk |
| Timeout (Hobby) | 10 s | — |
| Timeout (Pro) | 60 s | — |

## Voir aussi

- [[21 — Endpoint upload-chunk]]
- [[27 — Middleware Edge]]
- [[30 — Vercel]]
