# Architecture générale

## Stack technique

```
┌─────────────────────────────────────────────────┐
│                  Navigateur                      │
│                                                  │
│  React (Vite)  ←→  Web Crypto API               │
│  - Chiffrement AES-256-GCM côté client          │
│  - PBKDF2 dérivation de clé (200k itérations)   │
│  - Upload/download par chunks XHR               │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
                       ▼
┌──────────────────────────────────────────────────┐
│              Cloudflare (proxy)                   │
│  - DNS, SSL/TLS, cache statique                  │
│  - WAF (attention aux règles sur /api/)          │
│  - Header CF-Connecting-IP pour rate limiting    │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│              Vercel                               │
│                                                   │
│  ┌─────────────────┐  ┌────────────────────────┐ │
│  │  Static (SPA)   │  │  Serverless Functions   │ │
│  │  frontend/dist  │  │  api/*.js               │ │
│  └─────────────────┘  └───────────┬────────────┘ │
│                                   │              │
│                    ┌──────────────▼────────────┐ │
│                    │     Vercel Blob Storage    │ │
│                    │  - metadata/*.json         │ │
│                    │  - transfers/{code}/*.enc  │ │
│                    └───────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

## Flux d'envoi

```
1. Utilisateur sélectionne fichier(s) + mot de passe
2. Frontend génère un code à 6 caractères (rejection sampling)
3. Frontend génère un salt (128 bits)
4. Frontend dérive la clé via PBKDF2 (passphrase + salt → AES key)
5. Chaque fichier est chiffré (AES-256-GCM) dans le navigateur
6. Les données chiffrées sont découpées en chunks de 3.5 Mo
7. Chaque chunk est envoyé via POST /api/upload/chunk (XHR)
8. Le dernier chunk du dernier fichier inclut les métadonnées
9. Le serveur crée metadata/{code}.json avec les URLs des chunks
10. Le frontend affiche le code + QR code
```

## Flux de réception

```
1. Utilisateur saisit le code (ou scanne le QR)
2. Frontend appelle GET /api/file/{code}/info
3. Le serveur retourne la liste des fichiers + salt + expiration
4. Utilisateur saisit le mot de passe
5. Pour chaque fichier :
   a. Frontend télécharge chaque chunk via GET /api/file/{code}/download?file=F&chunk=C
   b. Les chunks sont reassemblés en mémoire
   c. La clé est dérivée (PBKDF2) et le fichier est déchiffré (AES-GCM)
   d. Le fichier déchiffré est proposé en téléchargement navigateur
6. Après le dernier chunk du dernier fichier : suppression automatique (quota)
```

## Principes clés

- **Zéro connaissance** : le serveur ne voit jamais les données en clair ni le mot de passe
- **Usage unique** : les fichiers sont supprimés dès le premier téléchargement
- **Filet de sécurité** : si jamais téléchargé, le cron supprime après expiration (24h par défaut)
- **Pas de compte** : aucune authentification utilisateur

## Voir aussi

- [[11 — Chiffrement côté client]]
- [[20 — API overview]]
- [[40 — Modèle de sécurité]]
