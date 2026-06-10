/**
 * POST /api/file/:code/delete
 *
 * Supprime un transfert (fichier chiffré + métadonnées).
 * Réservé à l'expéditeur qui fournit le deleteToken reçu lors de l'upload.
 *
 * Header requis :
 *   x-delete-token : token 128 bits hex retourné par /api/upload
 *
 * Sans ce token, la suppression est refusée (403).
 */

import { list, del } from '@vercel/blob';
import { timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';

const CODE_REGEX        = /^[A-Z2-9]{6}$/;
const DELETE_TOKEN_REGEX = /^[0-9a-f]{32}$/;
const BLOB_TOKEN         = () => process.env.BLOB_READ_WRITE_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const code        = (req.query.code || '').toString().toUpperCase();
  const deleteToken = (req.headers['x-delete-token'] || '').toLowerCase();

  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Format de code invalide' });
  }
  // Validation du format pour éviter tout traitement de valeurs arbitraires
  if (!DELETE_TOKEN_REGEX.test(deleteToken)) {
    return res.status(403).json({ error: 'Token de suppression manquant ou invalide' });
  }

  try {
    const { blobs: metaBlobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    if (!metaBlobs.length) {
      return res.status(404).json({ error: 'Transfert introuvable' });
    }

    const metaResponse = await fetch(metaBlobs[0].url, {
      headers: { Authorization: `Bearer ${BLOB_TOKEN()}` },
    });
    if (!metaResponse.ok) {
      return res.status(404).json({ error: 'Métadonnée introuvable' });
    }
    const meta = await metaResponse.json();

    // Comparaison en temps constant (crypto natif Node.js)
    if (!safeEqual(deleteToken, meta.deleteToken)) {
      return res.status(403).json({ error: 'Token de suppression invalide' });
    }

    const urlsToDelete = [metaBlobs[0].url];
    if (meta.files) {
      for (const f of meta.files) {
        if (f.chunkUrls) urlsToDelete.push(...f.chunkUrls);
      }
    }

    await del(urlsToDelete);
    console.log(`[delete] Transfert ${code} supprimé par l'expéditeur`);

    return res.json({ ok: true, deleted: urlsToDelete.length });
  } catch (err) {
    console.error('[delete] Erreur :', err.message);
    return res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
}

/**
 * Comparaison de chaînes en temps constant via crypto.timingSafeEqual natif.
 */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  return cryptoTimingSafeEqual(Buffer.from(a), Buffer.from(b));
}
