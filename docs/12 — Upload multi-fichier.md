# Upload multi-fichier

## Vue d'ensemble

L'upload supporte l'envoi de **plusieurs fichiers** dans un seul transfert. Chaque fichier est chiffré individuellement, puis découpé en chunks de 3.5 Mo envoyés séquentiellement.

## Flux détaillé

```
1. Utilisateur sélectionne N fichiers via DropZone
2. Génération : code (6 chars), salt (256 bits), clé AES (PBKDF2)
3. Pour chaque fichier i (0..N-1) :
   a. file.arrayBuffer() → AES-GCM encrypt → encryptedData
   b. Découpage en chunks de 3.5 Mo
   c. Pour chaque chunk j (0..M-1) :
      POST /api/upload/chunk
      Headers :
        x-blob-code: CODE
        x-chunk-index: j
        x-chunk-total: M
        x-file-index: i
        x-file-total: N
      Body : chunk binaire (application/octet-stream)
   d. Sur le dernier chunk du dernier fichier :
      Headers supplémentaires :
        x-blob-salt: salt
        x-blob-files: JSON [{ name, size }, ...]
4. Le serveur retourne deleteToken
```

## Limite de taille

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| Chunk size | 3.5 Mo | Limite body Vercel Serverless = 4.5 Mo |
| Taille max totale | 25 Mo (configurable) | `MAX_FILE_SIZE_MB` / `VITE_MAX_FILE_SIZE_MB` |

## Progression

La progression est calculée globalement sur tous les chunks de tous les fichiers :

```javascript
pct = Math.round((chunksUploaded / totalChunks) * 100)
```

Le dernier chunk est toujours affiché à 100%.

## DropZone (composant)

- Accepte `multiple` fichiers
- Drag & drop + clic pour parcourir
- **Déduplication** par nom + taille (évite les doublons)
- Liste des fichiers avec bouton ✕ pour retirer
- Validation de la taille totale avant envoi

## Client API

> Fichier : `frontend/src/api/client.js`

Fonctions :
- `uploadEncryptedFiles(code, encryptedFiles, salt, onProgress)` — multi-fichier
- `uploadEncryptedFile(...)` — wrapper rétrocompatible (single file)
- `sendChunk(...)` — envoi XHR d'un chunk individuel

## Stockage serveur

Les chunks sont stockés dans Vercel Blob :

```
transfers/{CODE}/f000-chunk-000.enc
transfers/{CODE}/f000-chunk-001.enc
transfers/{CODE}/f001-chunk-000.enc
...
```

## Voir aussi

- [[21 — Endpoint upload-chunk]]
- [[51 — Format des métadonnées]]
- [[31 — Vercel Blob]]
