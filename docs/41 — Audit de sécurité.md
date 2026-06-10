# Audit de sécurité

> Audit initial sur `dd02f5b` (6 fixes). Audit complémentaire sur `135cdff`–`b693923` (6 fixes).

## Corrections appliquées — Round 1 (`dd02f5b`)

### 1. Divulgation d'environnement (health endpoint)

**Avant** : `/api/health` retournait `env: process.env.NODE_ENV`
**Risque** : Fuite d'information sur l'environnement d'exécution
**Fix** : Suppression du champ `env` de la réponse

### 2. Biais modulo dans la génération du code

**Avant** : `alphabet[randomByte % 31]` — biais car 256 n'est pas divisible par 31
**Risque** : Certains caractères plus probables, réduisant l'entropie effective
**Fix** : Rejection sampling — les octets ≥ 248 sont rejetés

```javascript
const limit = 256 - (256 % 31); // 248
// Seuls les octets < 248 sont utilisés
```

### 3. Écrasement de transfert existant

**Avant** : Pas de vérification si un code existe déjà
**Risque** : Un attaquant pourrait écraser un transfert légitime
**Fix** : Vérification metadata sur le premier chunk → 409 Conflict

### 4. Chunks orphelins non nettoyés

**Avant** : Un upload échoué laissait des chunks dans `transfers/` sans metadata
**Risque** : Fuite de stockage, données jamais supprimées
**Fix** : Phase 2 du cron cleanup — scan `transfers/` vs `metadata/`

### 5. CSP permissive (`unsafe-inline`)

**Avant** : `script-src 'self' 'unsafe-inline'`
**Risque** : XSS possible via scripts inline injectés
**Fix** : Suppression de `'unsafe-inline'` de `script-src`

### 6. Requêtes cross-origin autorisées

**Avant** : Pas de validation de l'header `Origin`
**Risque** : CSRF, utilisation de l'API depuis des domaines tiers
**Fix** : Middleware Edge rejette les requêtes avec un `Origin` différent

## Corrections appliquées — Round 2 (`b3b4508`)

### 7. Anti-énumération de codes

**Avant** : Pas de protection contre le brute-force des codes de transfert
**Risque** : Un attaquant pouvait tester des codes en masse
**Fix** : Tracking par IP des échecs + délai de 1 s sur codes invalides + blocage après 8 échecs (5 min)

## Corrections appliquées — Round 3 (`135cdff`)

### 8. Race condition sur le quota de téléchargement (CRITIQUE)

**Avant** : `downloadCount` incrémenté sans verrouillage → deux requêtes concurrentes pouvaient passer
**Risque** : Téléchargement multiple d'un fichier censé être single-use
**Fix** : Verrouillage optimiste — re-lecture de la metadata après écriture, rejet si le compteur a changé

### 9. Chunks incomplets acceptés à l'upload (CRITIQUE)

**Avant** : Aucune vérification que tous les chunks attendus avaient été reçus
**Risque** : Metadata créée pour un fichier avec des chunks manquants → données corrompues
**Fix** : Validation de complétude — vérification des indices continus (0, 1, 2…N-1) avant finalisation

### 10. Crash sur nom de fichier mal encodé (HIGH)

**Avant** : `decodeURIComponent()` sans try-catch dans `/api/upload`
**Risque** : Un header `x-blob-name` malformé (`%ZZ`) causait un crash 500
**Fix** : Try-catch → retourne 400 proprement

### 11. Timing leak sur la longueur du CRON_SECRET (HIGH)

**Avant** : Check de longueur avant `timingSafeEqual` dans `/api/cron/cleanup`
**Risque** : Un attaquant pouvait déduire la longueur du secret par timing
**Fix** : Comparaison via HMAC-SHA256 à temps constant (longueur fixe)

## Corrections appliquées — Round 4 (`b693923`)

### 12. PBKDF2 200k itérations insuffisant (MEDIUM)

**Avant** : 200 000 itérations PBKDF2
**Risque** : En dessous de la recommandation NIST SP 800-132 (2024)
**Fix** : 600 000 itérations (frontend + CLI)

### 13. Sel PBKDF2 trop court (MEDIUM)

**Avant** : 128 bits (16 octets)
**Risque** : Sel inférieur à la taille de la clé AES-256
**Fix** : 256 bits (32 octets) — regex backend mise à jour (64 hex chars)

## Corrections appliquées — Round 5 (`1588d83`+)

### 14. CSP `style-src 'unsafe-inline'` (LOW)

**Avant** : `style-src 'self' 'unsafe-inline'` pour permettre les `style={{}}` React
**Risque** : Un attaquant pourrait injecter des styles inline malveillants
**Fix** : Remplacement des styles inline par des classes CSS et CSS custom properties (`--progress`), suppression de `'unsafe-inline'`

### 15. Pas de `upgrade-insecure-requests` (LOW)

**Avant** : CSP sans directive de forçage HTTPS
**Risque** : Un utilisateur accédant en HTTP n'est pas redirigé vers HTTPS par le navigateur
**Fix** : Ajout de `upgrade-insecure-requests` dans la CSP

## Vecteurs non couverts (à surveiller)

| Vecteur | Statut | Note |
|---------|--------|------|
| Rate limiting distribué | Partiel | Par instance Edge seulement |
| Enumération de codes | Mitigé | Delay 1 s + blocage IP après 8 échecs |
| Replay de chunks | À évaluer | Pas de nonce par chunk |
| Abuse (spam de transfers) | Partiel | Rate limit upload 5/min |

## Voir aussi

- [[40 — Modèle de sécurité]]
- [[42 — Headers de sécurité]]
- [[27 — Middleware Edge]]
