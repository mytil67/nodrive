# Vercel Blob Storage

## Vue d'ensemble

Vercel Blob est le stockage objet utilisé pour les fichiers chiffrés et les métadonnées. Tous les blobs sont en accès **privé** — seules les Serverless Functions y accèdent via le `BLOB_READ_WRITE_TOKEN`.

## Structure des blobs

```
vercel-blob/
├── metadata/
│   ├── AB3K7P.json          # Métadonnées du transfert AB3K7P
│   ├── XY9R2M.json
│   └── ...
└── transfers/
    ├── AB3K7P/
    │   ├── f000-chunk-000.enc   # Fichier 0, chunk 0
    │   ├── f000-chunk-001.enc   # Fichier 0, chunk 1
    │   ├── f001-chunk-000.enc   # Fichier 1, chunk 0
    │   └── ...
    └── XY9R2M/
        └── f000-chunk-000.enc
```

### Convention de nommage des chunks

```
f{fileIndex:3digits}-chunk-{chunkIndex:3digits}.enc
```

Exemples : `f000-chunk-000.enc`, `f001-chunk-002.enc`

Le padding à 3 chiffres garantit le tri lexicographique correct.

## Opérations utilisées

| Opération | SDK | Utilisé par |
|-----------|-----|-------------|
| `put(path, data, options)` | `@vercel/blob` | chunk.js (stockage), download.js (update metadata) |
| `list({ prefix, limit, cursor })` | `@vercel/blob` | info.js, download.js, delete.js, cleanup.js |
| `del(urls)` | `@vercel/blob` | delete.js, download.js, cleanup.js |

### Options `put` importantes

```javascript
await put(pathname, data, {
  access: 'private',
  contentType: 'application/octet-stream',
  addRandomSuffix: false,    // Pas de suffixe aléatoire
  allowOverwrite: true,      // Nécessaire pour update metadata
});
```

## Accès

Les blobs sont en accès privé. Pour les lire, il faut le token :

```javascript
const response = await fetch(blob.url, {
  headers: { Authorization: `Bearer ${BLOB_READ_WRITE_TOKEN}` }
});
```

> Le client n'accède **jamais** directement au Blob Storage. Le endpoint `download.js` agit comme proxy.

## Quotas

| Plan | Stockage | Bandwidth |
|------|----------|-----------|
| Hobby | 500 Mo | inclus dans les 100 Go |
| Pro | configurable | inclus |

## Cycle de vie d'un blob

```
Upload chunk → put() dans transfers/
Dernier chunk → put() metadata + collecte chunkUrls
Download    → lecture via proxy (download.js)
             → suppression après premier téléchargement
Expiration  → suppression par cron cleanup (24h)
Orphelins   → suppression par cron cleanup phase 2
```

## Voir aussi

- [[51 — Format des métadonnées]]
- [[26 — Cron cleanup]]
- [[30 — Vercel]]
