# Endpoint info

> `GET /api/file/:code/info` — Fichier : `api/file/[code]/info.js`

## Description

Retourne les métadonnées publiques d'un transfert. Permet au frontend de savoir combien de fichiers il y a, leur taille, et combien de chunks télécharger.

## Requête

```
GET /api/file/AB3K7P/info
```

## Réponse (200)

```json
{
  "files": [
    { "originalName": "rapport.pdf", "size": 1048576, "chunkCount": 1 },
    { "originalName": "photo.jpg", "size": 3145728, "chunkCount": 1 }
  ],
  "salt": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "expiresAt": 1717689600000,
  "maxDownloads": 1,
  "downloadCount": 0
}
```

## Rétrocompatibilité

Si les métadonnées utilisent l'ancien format (champ `originalName` au top level), le endpoint normalise automatiquement en array `files` :

```javascript
if (meta.files) {
  files = meta.files.map(f => ({ originalName, size, chunkCount }));
} else {
  files = [{ originalName: meta.originalName, size: meta.size, chunkCount: meta.chunkCount || 0 }];
}
```

## Erreurs

| Status | Cas |
|--------|-----|
| 400 | Format de code invalide |
| 404 | Code introuvable |
| 410 | Fichier expiré ou quota atteint |

## Voir aussi

- [[23 — Endpoint download]]
- [[51 — Format des métadonnées]]
