# Format des métadonnées

> Stocké dans Vercel Blob : `metadata/{CODE}.json`

## Format actuel (multi-fichier, v0.3.x)

```json
{
  "code": "AB3K7P",
  "salt": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "deleteToken": "deadbeef12345678deadbeef12345678",
  "files": [
    {
      "originalName": "rapport.pdf",
      "size": 1048576,
      "chunkCount": 1,
      "chunkUrls": [
        "https://....blob.vercel-storage.com/transfers/AB3K7P/f000-chunk-000.enc"
      ]
    },
    {
      "originalName": "photo.jpg",
      "size": 5242880,
      "chunkCount": 2,
      "chunkUrls": [
        "https://....blob.vercel-storage.com/transfers/AB3K7P/f001-chunk-000.enc",
        "https://....blob.vercel-storage.com/transfers/AB3K7P/f001-chunk-001.enc"
      ]
    }
  ],
  "totalSize": 6291456,
  "encryptedSize": 6291504,
  "createdAt": 1717603200000,
  "expiresAt": 1717689600000,
  "maxDownloads": 1,
  "downloadCount": 0,
  "encrypted": true
}
```

## Champs

| Champ | Type | Description |
|-------|------|-------------|
| `code` | string | Code transfert 6 chars |
| `salt` | string | Salt PBKDF2 (hex, 32 chars) |
| `deleteToken` | string | Token suppression (hex, 32 chars) |
| `files` | array | Liste des fichiers |
| `files[].originalName` | string | Nom original du fichier |
| `files[].size` | number | Taille originale en octets |
| `files[].chunkCount` | number | Nombre de chunks chiffrés |
| `files[].chunkUrls` | string[] | URLs Vercel Blob des chunks |
| `totalSize` | number | Somme des tailles originales |
| `encryptedSize` | number | Somme des tailles chiffrées |
| `createdAt` | number | Timestamp création (ms) |
| `expiresAt` | number | Timestamp expiration (ms) |
| `maxDownloads` | number | Nb max de téléchargements (1 par défaut) |
| `downloadCount` | number | Compteur de téléchargements |
| `encrypted` | boolean | Toujours `true` |

## Anciens formats (rétrocompatibles)

### Format v0.1.x — Blob unique

```json
{
  "code": "AB3K7P",
  "originalName": "rapport.pdf",
  "size": 1048576,
  "blobUrl": "https://....blob.vercel-storage.com/...",
  "salt": "...",
  "deleteToken": "...",
  ...
}
```

### Format v0.2.x — Chunked single file

```json
{
  "code": "AB3K7P",
  "originalName": "rapport.pdf",
  "size": 1048576,
  "chunkCount": 3,
  "chunkUrls": ["...", "...", "..."],
  "salt": "...",
  ...
}
```

## Détection du format

```javascript
if (meta.files)     → Format multi-fichier (v0.3.x)
if (meta.chunkUrls) → Format chunked single (v0.2.x)
if (meta.blobUrl)   → Format blob unique (v0.1.x)
```

Tous les endpoints (info, download, delete, cleanup) gèrent les 3 formats.

## Voir aussi

- [[21 — Endpoint upload-chunk]]
- [[31 — Vercel Blob]]
- [[23 — Endpoint download]]
