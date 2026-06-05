# Cron cleanup

> `GET /api/cron/cleanup` — Fichier : `api/cron/cleanup.js`

## Description

Tâche planifiée exécutée quotidiennement par Vercel Cron. Agit comme **filet de sécurité** : supprime les transferts jamais téléchargés (expirés) et les chunks orphelins d'uploads échoués.

> En usage normal, les fichiers sont supprimés immédiatement après le premier téléchargement (`maxDownloads=1`). Le cron ne traite que les cas résiduels.

## Planification

Configuré dans `vercel.json` :

```json
{
  "crons": [{
    "path": "/api/cron/cleanup",
    "schedule": "0 3 * * *"
  }]
}
```

→ Tous les jours à **3h00 UTC**.

## Authentification

```
Authorization: Bearer {CRON_SECRET}
```

- Vercel injecte automatiquement `CRON_SECRET` dans les requêtes cron
- Comparaison timing-safe via `crypto.timingSafeEqual`
- Toute requête sans le bon secret → 401

## Phase 1 : Suppression des transferts expirés (jamais téléchargés)

```
Pour chaque metadata/*.json :
  1. Lire le contenu JSON
  2. Si Date.now() > meta.expiresAt :
     - Supprimer metadata/{code}.json
     - Supprimer meta.blobUrl (ancien format)
     - Supprimer meta.chunkUrls[] (ancien format chunked)
     - Supprimer meta.files[].chunkUrls[] (multi-fichier)
     - Incrémenter compteur deleted
```

## Phase 2 : Nettoyage des chunks orphelins

Cas d'usage : un upload échoue à mi-parcours → des chunks existent dans `transfers/` mais aucune metadata n'a été créée.

```
1. Collecter tous les codes ayant une metadata valide
2. Scanner transfers/ :
   - Si un code n'a pas de metadata → chunks orphelins
   - Supprimer ces chunks
```

## Réponse

```json
{
  "deleted": 3,
  "orphaned": 12,
  "errors": 0,
  "message": "Nettoyage terminé : 3 supprimé(s), 12 orphelin(s), 0 erreur(s)"
}
```

## Voir aussi

- [[31 — Vercel Blob]]
- [[51 — Format des métadonnées]]
