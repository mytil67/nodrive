# Modèle de sécurité

## Principe : Zéro connaissance

Le serveur ne peut **jamais** accéder aux données en clair. Il stocke uniquement :
- Des données chiffrées (AES-256-GCM)
- Le salt (public, nécessaire pour dériver la clé)
- Les métadonnées non sensibles (noms de fichier, tailles, expiration)

Le **mot de passe** ne quitte jamais le navigateur.

## Modèle de menace

### Ce contre quoi NoDrive protège

| Menace | Protection |
|--------|-----------|
| Interception réseau (MITM) | HTTPS + HSTS preload |
| Accès serveur compromis | Chiffrement E2E côté client |
| Brute-force mot de passe | PBKDF2 200k itérations |
| Timing attack sur deleteToken | `crypto.timingSafeEqual` |
| Modulo bias (code transfert) | Rejection sampling |
| Upload malveillant sur code existant | Vérification 409 Conflict |
| Chunks orphelins (upload échoué) | Cron cleanup phase 2 |
| CSRF | Validation Origin middleware |
| XSS | CSP strict (pas d'inline scripts) |
| Clickjacking | `X-Frame-Options: DENY` |

### Ce que NoDrive ne protège PAS

| Risque | Raison |
|--------|--------|
| Mot de passe faible | Pas de contrainte de complexité (min 6 chars) |
| Partage du code+mdp sur canal non sécurisé | Responsabilité utilisateur |
| Noms de fichiers | Stockés en clair dans les métadonnées |
| Taille des fichiers | Visible dans les métadonnées |
| Corrélation IP expéditeur/destinataire | Pas de Tor/VPN intégré |
| Key logger sur la machine client | Hors périmètre |

## Chaîne de confiance

```
Navigateur ──── HTTPS ──── Cloudflare ──── HTTPS ──── Vercel
    │                                                     │
    │ AES-256-GCM                              Blob privé │
    │ Clé dérivée du mot de passe              Token auth  │
    │ Jamais transmise                         Jamais exposé│
```

## Suppression des données

| Mécanisme | Déclencheur | Délai |
|-----------|-------------|-------|
| Après téléchargement | `downloadCount >= maxDownloads` | Immédiat |
| Expiration | `Date.now() > expiresAt` | Cron à 3h UTC |
| Annulation manuelle | Bouton "Annuler" + deleteToken | Immédiat |
| Chunks orphelins | Upload échoué sans metadata | Cron à 3h UTC |

## Voir aussi

- [[41 — Audit de sécurité]]
- [[42 — Headers de sécurité]]
- [[11 — Chiffrement côté client]]
