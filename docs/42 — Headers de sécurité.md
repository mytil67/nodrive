# Headers de sécurité

> Configurés dans `vercel.json`, appliqués sur toutes les routes.

## Headers actifs

| Header | Valeur | Protection |
|--------|--------|-----------|
| `Content-Security-Policy` | Voir ci-dessous | XSS, injection |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Fuite d'URL |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | APIs sensibles |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Downgrade HTTPS |

## Content-Security-Policy (détail)

```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data: blob:;
connect-src 'self';
font-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
form-action 'self';
upgrade-insecure-requests;
```

### Explications

| Directive | Valeur | Pourquoi |
|-----------|--------|----------|
| `script-src 'self'` | Pas d'inline | Bloque XSS inline |
| `style-src 'self'` | Pas d'inline | Tous les styles via CSS (plus aucun `style={}` React) |
| `img-src data: blob:` | Nécessaire | QR code SVG en data URL + blob URL pour téléchargement |
| `connect-src 'self'` | Strict | Pas de domaine externe (les blobs sont proxiés par le serveur) |
| `object-src 'none'` | Bloqué | Pas de plugins Flash/Java |
| `frame-ancestors 'none'` | Bloqué | Pas d'embedding en iframe |
| `upgrade-insecure-requests` | Forcé | Toute requête HTTP est automatiquement redirigée en HTTPS |

### Domaines Blob Storage absents de connect-src

Les URLs Vercel Blob (ex: `*.public.blob.vercel-storage.com`) ne sont **pas** dans `connect-src` car :
- Le frontend ne contacte jamais directement le Blob Storage
- Tout passe par les Serverless Functions (proxy)
- Ajouter ces domaines serait une faille de sécurité

## Headers API

```json
{ "source": "/api/(.*)", "headers": [{ "key": "Cache-Control", "value": "no-store, no-cache" }] }
```

Empêche le cache des réponses API (données sensibles, tokens, compteurs).

## Voir aussi

- [[40 — Modèle de sécurité]]
- [[30 — Vercel]]
- [[32 — Cloudflare]]
