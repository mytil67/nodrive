# Endpoint upload-chunk

> `POST /api/upload/chunk` — Fichier : `api/upload/chunk.js`

## Description

Reçoit un chunk de fichier chiffré et le stocke dans Vercel Blob. Sur le dernier chunk du dernier fichier, crée les métadonnées du transfert.

## Configuration

```javascript
export const config = { api: { bodyParser: false } };
```

> **Critique** : `bodyParser: false` est obligatoire. Sans ça, Vercel parse le body comme JSON/URL-encoded et consomme le stream avant que le handler ne puisse le lire → erreur 500.

## Headers requis

| Header | Type | Exemple | Requis |
|--------|------|---------|--------|
| `Content-Type` | string | `application/octet-stream` | Oui |
| `x-blob-code` | string | `AB3K7P` | Oui |
| `x-chunk-index` | int | `0` | Oui |
| `x-chunk-total` | int | `3` | Oui |
| `x-file-index` | int | `0` | Oui |
| `x-file-total` | int | `2` | Oui |
| `x-blob-salt` | string | `a1b2c3...` (hex) | Dernier chunk uniquement |
| `x-blob-files` | JSON | `[{"name":"f.pdf","size":1234}]` | Dernier chunk uniquement |

## Logique

### Chunk intermédiaire
1. Lire le body brut (stream → Buffer)
2. Stocker dans Vercel Blob : `transfers/{CODE}/f{FI}-chunk-{CI}.enc`
3. Retourner `{ ok: true }`

### Premier chunk du premier fichier
- Vérifie qu'il n'existe pas déjà de metadata pour ce code → **409 Conflict**

### Dernier chunk du dernier fichier
1. Stocker le chunk
2. Lister tous les blobs dans `transfers/{CODE}/`
3. Regrouper par préfixe fichier (`f000`, `f001`, ...)
4. Trier les chunks par index
5. Créer `metadata/{CODE}.json` avec :
   - `files[]` : nom, taille, chunkCount, chunkUrls
   - `salt`, `deleteToken`, `createdAt`, `expiresAt`
   - `maxDownloads`, `downloadCount`, `encrypted: true`
6. Retourner `{ ok: true, deleteToken }`

## Réponses

| Status | Body | Cas |
|--------|------|-----|
| 200 | `{ ok: true }` | Chunk intermédiaire stocké |
| 200 | `{ ok: true, deleteToken: "..." }` | Dernier chunk, metadata créée |
| 400 | `{ error: "..." }` | Code invalide, headers manquants |
| 409 | `{ error: "..." }` | Code déjà utilisé |
| 413 | `{ error: "..." }` | Taille totale dépasse la limite |
| 500 | `{ error: "..." }` | Erreur serveur |

## Voir aussi

- [[12 — Upload multi-fichier]]
- [[51 — Format des métadonnées]]
- [[31 — Vercel Blob]]
