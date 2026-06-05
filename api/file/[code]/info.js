/**
 * GET /api/file/:code/info
 *
 * Retourne les métadonnées publiques d'un transfert :
 *  - nom original, taille, expiration, URL du blob chiffré
 * Ne retourne jamais de clé de chiffrement (elle n'est pas stockée côté serveur).
 * Vérifie l'expiration et le quota de téléchargements.
 */

import { list } from '@vercel/blob';

const BLOB_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;

/** Format attendu pour un code de transfert. */
const CODE_REGEX = /^[A-Z2-9]{6}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const code = (req.query.code || '').toString().toUpperCase();

  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Format de code invalide' });
  }

  try {
    // Chercher la métadonnée par préfixe (addRandomSuffix: false garantit un nom unique)
    const { blobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });

    if (!blobs.length) {
      return res.status(404).json({ error: 'Code invalide ou expiré' });
    }

    // Récupérer le contenu JSON de la métadonnée (blob privé — auth requise)
    const response = await fetch(blobs[0].url, {
      headers: { Authorization: `Bearer ${BLOB_TOKEN()}` },
    });
    if (!response.ok) {
      return res.status(404).json({ error: 'Métadonnée introuvable' });
    }
    const meta = await response.json();

    // Vérifier l'expiration
    if (Date.now() > meta.expiresAt) {
      return res.status(410).json({ error: 'Ce fichier a expiré' });
    }

    // Vérifier le quota de téléchargements
    if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
      return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
    }

    // Retourner uniquement les infos nécessaires au frontend
    // blobUrl n'est pas retourné : le fichier est privé, le frontend passe par /download
    return res.json({
      originalName:  meta.originalName,
      size:          meta.size,
      expiresAt:     meta.expiresAt,
      maxDownloads:  meta.maxDownloads,
      downloadCount: meta.downloadCount,
    });
  } catch (err) {
    console.error('[info] Erreur :', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
}
