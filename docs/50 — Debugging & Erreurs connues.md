# Debugging & Erreurs connues

## Erreurs résolues (historique)

### 1. "Téléchargement du fichier chiffré échoué" — Vercel body limit

**Symptôme** : Download échoue sur les gros fichiers
**Cause** : Vercel Serverless a une limite de 4.5 Mo sur le body de réponse. Impossible de streamer un fichier de 12 Mo en une seule réponse.
**Fix** : Téléchargement par chunks côté frontend (`?chunk=0`, `?chunk=1`, etc.)

### 2. "Téléchargement du fichier chiffré échoué" — 3 bugs dans le flux download

**Symptôme** : Même erreur, mais après le fix des chunks
**Causes** (3 bugs simultanés) :
1. Metadata supprimée sur chunk 0 → chunks 1+ reçoivent 404
2. Vérification quota sur TOUS les chunks → chunks 1+ bloqués après incrément
3. `allowOverwrite: false` empêchait la mise à jour de metadata

**Fix** :
- Quota vérifié uniquement sur `file=0&chunk=0`
- Suppression uniquement sur le dernier chunk du dernier fichier
- `allowOverwrite: true` pour la mise à jour du compteur

### 3. Upload 500 sur chunk 2

**Symptôme** : `POST /api/upload/chunk 500 (Internal Server Error)` au chunk 2
**Cause** : Vercel body parser par défaut consomme le stream binaire avant le handler
**Fix** : `export const config = { api: { bodyParser: false } }`

### 4. Download 403 (Cloudflare WAF)

**Symptôme** : `chunk 0, HTTP 403` sur le téléchargement
**Cause** : Règles WAF Cloudflare personnalisées bloquant `/api/file/`
**Fix** : Suppression des règles WAF sur les routes API

## Comment debugger

### Logs Vercel

```bash
# Voir les logs en temps réel
vercel logs --follow

# Ou via le dashboard Vercel → Deployments → Functions
```

### Vérifier un transfert

```bash
# Info sur un transfert
curl https://nodrive.cc/api/file/AB3K7P/info

# Health check
curl https://nodrive.cc/api/health
```

### Vérifier Cloudflare

- Dashboard → Security → Events
- Chercher les événements `Block` ou `Challenge` sur les routes `/api/`

### Erreur de déchiffrement

Si le déchiffrement échoue :
- Mauvais mot de passe → AES-GCM lance une exception explicite
- Chunks dans le mauvais ordre → données corrompues → exception AES-GCM
- Chunk manquant → taille incorrecte → exception AES-GCM

## Pièges courants

| Piège | Solution |
|-------|----------|
| `bodyParser` activé sur endpoint binaire | `config = { api: { bodyParser: false } }` |
| WAF Cloudflare bloque l'API | Skip rules pour `/api/*` |
| `allowOverwrite: false` sur metadata update | Utiliser `allowOverwrite: true` |
| Rate limit trop strict en dev | Augmenter ou désactiver temporairement |
| `vercel dev` vs `npm run dev` | Utiliser `vercel dev` pour les routes API |

## Voir aussi

- [[30 — Vercel]]
- [[32 — Cloudflare]]
- [[23 — Endpoint download]]
