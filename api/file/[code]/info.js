/**
 * GET /api/file/:code/info
 *
 * Retourne les métadonnées publiques d'un transfert.
 */

import { list } from '@vercel/blob';

const BLOB_TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN;
const CODE_REGEX = /^[A-Z2-9]{6}$/;

// Délai artificiel sur les codes invalides — ralentit l'énumération brute-force
const delay = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const code = (req.query.code || '').toString().toUpperCase();
  if (!CODE_REGEX.test(code)) {
    await delay(1000);
    return res.status(400).json({ error: 'Format de code invalide' });
  }

  try {
    const { blobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    if (!blobs.length) {
      await delay(1000);
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

    if (!meta.files || !meta.files.length) {
      return res.status(410).json({ error: 'Format de transfert non supporté' });
    }

    const files = meta.files.map(f => ({
      originalName: f.originalName,
      size:         f.size,
      chunkCount:   f.chunkCount || 0,
    }));

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
