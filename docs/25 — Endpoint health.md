# Endpoint health

> `GET /api/health` — Fichier : `api/health.js`

## Description

Endpoint de health check utilisé par le frontend avant l'upload pour vérifier que le stockage est configuré.

## Réponse

```json
{
  "ok": true,
  "hasBlobToken": true
}
```

## Utilisation frontend

```javascript
const health = await checkServerHealth();
if (health !== null && !health.hasBlobToken) {
  throw new Error('Service de stockage non configuré');
}
```

> Si le health check échoue (réseau down), `null` est retourné et l'upload est tenté quand même — l'erreur sera plus explicite au moment du chunk upload.

## Sécurité

- **Ne retourne jamais** la valeur du token ni d'informations sur l'environnement
- Seul un booléen `hasBlobToken` indique si la variable est configurée
- Le champ `env` a été supprimé lors de l'audit de sécurité

## Voir aussi

- [[03 — Variables d'environnement]]
- [[41 — Audit de sécurité]]
