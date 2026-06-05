# NoDrive — Documentation technique

> Transfert de fichiers chiffré, temporaire, sans compte.
> **Version actuelle** : 0.3.x

---

## Navigation

### Architecture & Projet
- [[01 — Architecture générale]] — Vue d'ensemble, stack, flux de données
- [[02 — Structure des fichiers]] — Arborescence complète du projet
- [[03 — Variables d'environnement]] — Configuration `.env` et secrets

### Frontend
- [[10 — Frontend overview]] — React, Vite, routing, build
- [[11 — Chiffrement côté client]] — AES-256-GCM, PBKDF2, Web Crypto API
- [[12 — Upload multi-fichier]] — Chunking, progression, XHR
- [[13 — Download multi-fichier]] — Téléchargement par chunks, déchiffrement
- [[14 — UX & Animations]] — Fade-in, shimmer, transitions, responsive
- [[15 — Internationalisation]] — i18n FR/EN, interpolation

### Backend (API)
- [[20 — API overview]] — Serverless Functions Vercel, endpoints
- [[21 — Endpoint upload-chunk]] — POST /api/upload/chunk
- [[22 — Endpoint info]] — GET /api/file/:code/info
- [[23 — Endpoint download]] — GET /api/file/:code/download
- [[24 — Endpoint delete]] — POST /api/file/:code/delete
- [[25 — Endpoint health]] — GET /api/health
- [[26 — Cron cleanup]] — Nettoyage automatique des transferts expirés
- [[27 — Middleware Edge]] — Rate limiting, CORS, Cloudflare

### Infrastructure
- [[30 — Vercel]] — Déploiement, configuration, limites
- [[31 — Vercel Blob]] — Stockage, structure des blobs, quotas
- [[32 — Cloudflare]] — Proxy, DNS, WAF, règles à éviter
- [[33 — GitHub]] — Dépôt, CI/CD, workflow

### Sécurité
- [[40 — Modèle de sécurité]] — Chiffrement E2E, zéro connaissance
- [[41 — Audit de sécurité]] — 6 corrections appliquées, vecteurs d'attaque
- [[42 — Headers de sécurité]] — CSP, HSTS, X-Frame-Options

### Opérations
- [[50 — Debugging & Erreurs connues]] — Problèmes résolus, pièges
- [[51 — Format des métadonnées]] — JSON metadata multi-fichier
- [[52 — Versioning]] — Script bump-version, semver

---

## Liens rapides

| Ressource | URL |
|-----------|-----|
| Repo GitHub | `github.com/mytil67/nodrive` |
| Production | `nodrive.cc` |
| Vercel Dashboard | `vercel.com/dashboard` |
| Cloudflare Dashboard | `dash.cloudflare.com` |
