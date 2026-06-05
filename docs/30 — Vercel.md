# Vercel

## Configuration du projet

### `vercel.json`

| Clé | Valeur | Description |
|-----|--------|-------------|
| `installCommand` | `npm install && cd frontend && npm install` | Installe root + frontend |
| `buildCommand` | `cd frontend && npm run build` | Build Vite |
| `outputDirectory` | `frontend/dist` | Dossier servi en statique |

### Rewrites (SPA)

```json
{ "source": "/((?!api/).*)", "destination": "/index.html" }
```

Toutes les routes non-API sont redirigées vers `index.html` pour le routing React côté client.

### Headers de sécurité

Appliqués sur toutes les routes (`/(.*)`). Voir [[42 — Headers de sécurité]].

### Cache API

```json
{ "source": "/api/(.*)", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache" }] }
```

## Limites importantes

| Limite | Plan Hobby | Plan Pro |
|--------|-----------|----------|
| **Body request** | **4.5 Mo** | **4.5 Mo** |
| **Body response** | **4.5 Mo** | **4.5 Mo** |
| Timeout | 10 s | 60 s |
| Bandwidth | 100 Go/mois | 1 To/mois |
| Serverless invocations | 100k/jour | illimité |
| Blob Storage | 500 Mo (gratuit) | configurable |
| Cron jobs | 1/jour max (Hobby) | 1/heure max |

> **Conséquence directe** : la limite de 4.5 Mo body est la raison du chunking. Les fichiers sont découpés en chunks de 3.5 Mo (avec marge pour les headers).

## Déploiement

```bash
# Production (depuis main)
git push origin main
# → Vercel déploie automatiquement

# Preview (depuis une branche)
git push origin feature-branch
# → Vercel crée un déploiement preview
```

## Variables d'environnement

Settings → Environment Variables dans le dashboard Vercel.

Voir [[03 — Variables d'environnement]] pour la liste complète.

## Serverless Functions

- Chaque fichier dans `api/` = une function
- Runtime : Node.js
- Les routes dynamiques utilisent la convention `[param]` (ex: `api/file/[code]/info.js`)

### `bodyParser: false`

Obligatoire pour les endpoints recevant du binaire :

```javascript
export const config = { api: { bodyParser: false } };
```

Sans ça, Vercel parse le body comme JSON → le stream est consommé → erreur 500.

Endpoints concernés :
- `api/upload/chunk.js`
- `api/upload.js`

## Voir aussi

- [[31 — Vercel Blob]]
- [[32 — Cloudflare]]
- [[42 — Headers de sécurité]]
