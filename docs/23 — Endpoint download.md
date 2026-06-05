# Endpoint download

> `GET /api/file/:code/download` — Fichier : `api/file/[code]/download.js`

## Description

Proxy serveur qui récupère un chunk chiffré depuis Vercel Blob et le stream au client. Gère le quota de téléchargement et le nettoyage automatique.

## Requête

```
GET /api/file/AB3K7P/download?file=0&chunk=0
GET /api/file/AB3K7P/download?file=0&chunk=1
GET /api/file/AB3K7P/download?file=1&chunk=0
```

| Paramètre | Type | Default | Description |
|-----------|------|---------|-------------|
| `file` | int | `0` | Index du fichier |
| `chunk` | int | `-1` | Index du chunk |

## Réponse

- **Content-Type** : `application/octet-stream`
- **Body** : données binaires chiffrées (stream)
- **Cache-Control** : `no-store`

## Logique de quota

```
file=0 & chunk=0 (première requête) :
  ├─ Vérifier downloadCount < maxDownloads
  ├─ Incrémenter downloadCount dans metadata
  └─ Continuer

Autres chunks :
  └─ Pas de vérification quota (transfert en cours)

Dernier chunk du dernier fichier :
  └─ Si downloadCount >= maxDownloads → supprimer metadata + tous les chunks
```

> **Pourquoi ce design ?** Un téléchargement multi-chunk doit pouvoir se terminer. Vérifier le quota à chaque chunk casserait le téléchargement après le premier chunk.

## Rétrocompatibilité

3 formats de métadonnées supportés :

| Format | Détection | Traitement |
|--------|-----------|------------|
| Multi-fichier | `meta.files` | `files[fi].chunkUrls[ci]` |
| Chunked single | `meta.chunkUrls` | Wrappé en `files[0]` |
| Blob unique (legacy) | `meta.blobUrl` | Stream direct |

## Proxy Vercel Blob

Le endpoint agit comme un proxy : il lit le blob privé avec le `BLOB_READ_WRITE_TOKEN` et stream la réponse au client. Le client n'a jamais accès direct au Blob Storage.

```
Client → Vercel Function → Vercel Blob → stream → Client
```

## Erreurs

| Status | Cas |
|--------|-----|
| 400 | Index fichier/chunk invalide |
| 404 | Code ou chunk introuvable |
| 410 | Expiré ou quota atteint |
| 500 | Erreur serveur |

## Voir aussi

- [[13 — Download multi-fichier]]
- [[22 — Endpoint info]]
