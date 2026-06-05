# Middleware Edge

> Fichier : `middleware.js` (racine)

## Description

Middleware Vercel Edge qui s'exécute **avant** chaque requête API. Gère le rate limiting et la validation CORS.

## Rate limiting

| Route | Limite | Fenêtre |
|-------|--------|---------|
| `/api/upload/*` | 5 requêtes | 1 minute |
| Autres `/api/*` | 60 requêtes | 1 minute |

### Identification du client

```
IP = headers['cf-connecting-ip']    // Cloudflare
  || headers['x-forwarded-for']     // Fallback
  || 'unknown'
```

### Stockage

Cache **en mémoire par instance Edge** (Map). Nettoyage périodique des entrées expirées.

> **Limitation** : le rate limiting est par instance Edge, pas global. Avec plusieurs instances, un client pourrait atteindre `N × limite`. Pour un rate limiting strict, utiliser un store distribué (Redis, Upstash).

## Validation CORS

```javascript
const requestOrigin = request.headers.get('origin');
if (requestOrigin && requestOrigin !== origin) {
  return new Response('Requête cross-origin non autorisée', { status: 403 });
}
```

Bloque les requêtes provenant d'un `Origin` différent du domaine hébergé. Empêche :
- Le CSRF depuis un site tiers
- L'utilisation de l'API depuis un domaine non autorisé

## Routes protégées

Le middleware ne s'applique qu'aux routes `/api/*`. Les routes statiques (SPA) ne sont pas interceptées.

## Voir aussi

- [[32 — Cloudflare]]
- [[40 — Modèle de sécurité]]
- [[42 — Headers de sécurité]]
