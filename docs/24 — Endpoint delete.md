# Endpoint delete

> `POST /api/file/:code/delete` — Fichier : `api/file/[code]/delete.js`

## Description

Permet à l'expéditeur de supprimer manuellement un transfert avant son expiration ou son téléchargement. Nécessite le `deleteToken` reçu lors de l'upload.

## Requête

```
POST /api/file/AB3K7P/delete
Header: x-delete-token: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
```

## Validation

1. **Code** : doit matcher `[A-Z2-9]{6}`
2. **Token** : doit matcher `[0-9a-f]{32}` (128 bits hex)
3. **Comparaison timing-safe** via `crypto.timingSafeEqual`

## Logique de suppression

```
1. Lire metadata/{code}.json
2. Comparer deleteToken (timing-safe)
3. Collecter toutes les URLs à supprimer :
   - metadata/{code}.json
   - meta.blobUrl (ancien format)
   - meta.chunkUrls (ancien format chunked)
   - meta.files[].chunkUrls (nouveau format multi-fichier)
4. del(urlsToDelete)
```

## Réponse

```json
{ "ok": true, "deleted": 5 }
```

## Erreurs

| Status | Cas |
|--------|-----|
| 400 | Format de code invalide |
| 403 | Token manquant, invalide, ou incorrect |
| 404 | Transfert introuvable |
| 405 | Méthode non autorisée |

## Sécurité

- Le `deleteToken` est un secret de 128 bits généré côté serveur
- La comparaison utilise `crypto.timingSafeEqual` pour éviter les timing attacks
- Le format du token est validé par regex avant toute comparaison

## Voir aussi

- [[40 — Modèle de sécurité]]
- [[21 — Endpoint upload-chunk]]
