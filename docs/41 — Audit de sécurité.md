# Audit de sécurité

> Audit réalisé sur le commit `dd02f5b`. 6 vulnérabilités identifiées et corrigées.

## Corrections appliquées

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

## Vecteurs non couverts (à surveiller)

| Vecteur | Statut | Note |
|---------|--------|------|
| Rate limiting distribué | Partiel | Par instance Edge seulement |
| Enumération de codes | Faible risque | 31^6 = ~887M combinaisons |
| Replay de chunks | À évaluer | Pas de nonce par chunk |
| Abuse (spam de transfers) | Partiel | Rate limit upload 5/min |

## Voir aussi

- [[40 — Modèle de sécurité]]
- [[42 — Headers de sécurité]]
- [[27 — Middleware Edge]]
