/**
 * GET /api/file/:code/info
 *
 * Retourne les métadonnées publiques d'un transfert.
 * Supporte l'ancien format (fichier unique) et le nouveau (multi-fichier).
 */

import { list } from '@vercel/blob';

const BLOB_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;
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
    const { blobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    if (!blobs.length) {
      return res.status(404).json({ error: 'Code invalide ou expiré' });
    }

    const response = await fetch(blobs[0].url, {
      headers: { Authorization: `Bearer ${BLOB_TOKEN()}` },
    });
    if (!response.ok) {
      return res.status(404).json({ error: 'Métadonnée introuvable' });
    }
    const meta = await response.json();

    if (Date.now() > meta.expiresAt) {
      return res.status(410).json({ error: 'Ce fichier a expiré' });
    }
    if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
      return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
    }

    // Normaliser : ancien format → nouveau format (files array)
    let files;
    if (meta.files) {
      files = meta.files.map(f => ({
        originalName: f.originalName,
        size:         f.size,
        chunkCount:   f.chunkCount || 0,
      }));
    } else {
      files = [{
        originalName: meta.originalName,
        size:         meta.size,
        chunkCount:   meta.chunkCount || 0,
      }];
    }

    return res.json({
      files,
      salt:          meta.salt,
      expiresAt:     meta.expiresAt,
      maxDownloads:  meta.maxDownloads,
      downloadCount: meta.downloadCount,
    });
  } catch (err) {
    console.error('[info] Erreur :', err.message);
    return res.status(500).json({ error: 'Erreur interne' });
  }
}
