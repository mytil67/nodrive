/**
 * POST /api/file/:code/confirm
 *
 * Confirme un téléchargement réussi côté destinataire (appelé par le client
 * UNIQUEMENT après un déchiffrement réussi). Incrémente le compteur ; si le
 * quota est atteint, supprime tout le transfert.
 *
 * Pourquoi un endpoint séparé de /download :
 *   Le service est zero-knowledge — le serveur ne peut pas vérifier le mot de
 *   passe. Si /download consommait le quota, un simple typo (déchiffrement
 *   échoué côté client) détruirait le fichier. En déplaçant la consommation
 *   ici, un mauvais mot de passe ou un download interrompu ne consomme rien :
 *   le fichier reste disponible jusqu'à sa confirmation, son expiration, ou le
 *   cron de nettoyage.
 *
 * Best-effort : le Blob store n'est pas transactionnel. Le filet de sécurité
 * ultime reste l'expiration (EXPIRATION_HOURS) + le cron cleanup.
 */

import { list, put, del } from '@vercel/blob';
import { timingSafeEqual } from 'crypto';

const CODE_REGEX     = /^[A-Z2-9]{6}$/;
const VERIFIER_REGEX = /^[0-9a-f]{64}$/;

/** Comparaison en temps constant de deux chaînes hex de même format. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const code = (req.query.code || '').toString().toUpperCase();
  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Format de code invalide' });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  try {
    const { blobs: metaBlobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    if (!metaBlobs.length) {
      // Déjà consommé/supprimé → succès idempotent.
      return res.json({ ok: true, consumed: true });
    }

    const metaResponse = await fetch(metaBlobs[0].url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!metaResponse.ok) {
      return res.json({ ok: true, consumed: true });
    }
    const meta = await metaResponse.json();

    // Preuve de connaissance du mot de passe : sans le verifier (dérivé du mot
    // de passe via PBKDF2), impossible de consommer le quota — et donc de
    // détruire un transfert en connaissant seulement le code.
    if (meta.verifier) {
      const provided = (req.headers['x-blob-verifier'] || '').toLowerCase();
      if (!VERIFIER_REGEX.test(provided) || !safeEqual(provided, meta.verifier)) {
        return res.status(403).json({ error: 'Verifier invalide' });
      }
    }

    const newCount     = (meta.downloadCount || 0) + 1;
    const reachedLimit = meta.maxDownloads > 0 && newCount >= meta.maxDownloads;

    if (reachedLimit) {
      // Quota atteint → purge complète (métadonnées + tous les chunks).
      const urlsToDelete = [metaBlobs[0].url];
      if (meta.files) {
        for (const f of meta.files) {
          if (f.chunkUrls) urlsToDelete.push(...f.chunkUrls);
        }
      }
      await del(urlsToDelete).catch(e =>
        console.error('[confirm] Erreur suppression :', e.message)
      );
      console.log(`[confirm] Transfert ${code} consommé et supprimé (quota atteint)`);
      return res.json({ ok: true, consumed: true });
    }

    // Sinon, incrémenter le compteur et conserver le transfert.
    const updatedMeta = { ...meta, downloadCount: newCount };
    await put(metaBlobs[0].pathname, JSON.stringify(updatedMeta, null, 2), {
      access:          'private',
      contentType:     'application/json',
      addRandomSuffix: false,
      allowOverwrite:  true,
    });
    console.log(`[confirm] Transfert ${code} : téléchargement ${newCount}/${meta.maxDownloads}`);
    return res.json({ ok: true, consumed: false, downloadCount: newCount });

  } catch (err) {
    console.error('[confirm] Erreur :', err.message);
    return res.status(500).json({ error: 'Erreur lors de la confirmation' });
  }
}
