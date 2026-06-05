# Cloudflare

## Rôle

Cloudflare est utilisé comme **proxy DNS** devant Vercel. Il fournit :
- SSL/TLS (terminaison)
- Cache des assets statiques
- Protection DDoS
- Header `CF-Connecting-IP` pour le rate limiting

## Configuration DNS

```
Type: CNAME
Name: nodrive.cc (ou @)
Target: cname.vercel-dns.com
Proxy: Activé (orange cloud)
```

## WAF — Règles à éviter

> **IMPORTANT** : ne pas créer de règles WAF qui bloquent les routes API.

### Routes à ne PAS bloquer

```
/api/upload/*      ← upload de chunks binaires
/api/file/*        ← download, info, delete
/api/health        ← health check
/api/cron/*        ← cron Vercel
```

### Incident passé

Des règles WAF personnalisées bloquaient les requêtes vers `/api/file/` avec une erreur **403**. Le téléchargement échouait avec :

```
Téléchargement du fichier chiffré échoué (chunk 0, HTTP 403)
```

**Solution** : supprimer les règles WAF qui matchent `/api/`.

### Règles WAF recommandées

Si tu veux des règles WAF, utilise des exceptions (skip) pour les routes API :

```
IF URI Path starts with "/api/" THEN Skip all remaining rules
```

## SSL/TLS

- Mode : **Full (strict)**
- Le certificat Vercel est valide → pas de problème avec Full strict
- Always Use HTTPS : activé
- Minimum TLS Version : 1.2

## Cache

- Les assets statiques (`/assets/*`) sont cachés par Cloudflare
- Les routes API ont `Cache-Control: no-store` → pas de cache
- Browser Cache TTL : respecte les headers d'origine

## Headers Cloudflare utilisés

| Header | Usage |
|--------|-------|
| `CF-Connecting-IP` | IP réelle du client (pour rate limiting) |
| `CF-RAY` | ID de requête (debugging) |

## Voir aussi

- [[27 — Middleware Edge]]
- [[30 — Vercel]]
- [[50 — Debugging & Erreurs connues]]
