/**
 * POST /api/upload/complete
 *
 * Appelé par le frontend après un client upload Vercel Blob réussi.
 * Crée les métadonnées et retourne le deleteToken.
 *
 * Body JSON :
 *   { code, originalName, size, salt, blobUrl, blobPathname }
 */

import { put, list } from '@vercel/blob';
import { randomBytes } from 'crypto';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10);
const EXPIRATION_HOURS = parseInt(process.env.EXPIRATION_HOURS || '24', 10);
const MAX_DOWNLOADS    = parseInt(process.env.MAX_DOWNLOADS    || '1',  10);

const CODE_REGEX = /^[A-Z2-9]{6}$/;
const SALT_REGEX = /^[0-9a-f]{32}$/;

function sanitizeFilename(name) {
  return String(name)
    .replace(/\0/g, '')
    .replace(/.*[\\/]/, '')
    .replace(/[^a-zA-Z0-9.\-_ ]/g, '_')
    .substring(0, 200)
    .trim() || 'fichier';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { code, originalName, size, salt, blobUrl, blobPathname } = req.body;

    if (!CODE_REGEX.test(code))  return res.status(400).json({ error: 'Code invalide' });
    if (!SALT_REGEX.test(salt))  return res.status(400).json({ error: 'Sel invalide' });
    if (!originalName)           return res.status(400).json({ error: 'Nom manquant' });
    if (!blobUrl)                return res.status(400).json({ error: 'URL blob manquante' });
    if (size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return res.status(400).json({ error: `Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)` });
    }

    // Vérifier qu'il n'y a pas déjà une métadonnée pour ce code
    const { blobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    if (blobs.length) {
      return res.status(409).json({ error: 'Code déjà utilisé' });
    }

    const deleteToken = randomBytes(16).toString('hex');
    const expiresAt   = Date.now() + EXPIRATION_HOURS * 3600 * 1000;

    const metadata = {
      code,
      originalName:  sanitizeFilename(originalName),
      size,
      salt,
      deleteToken,
      blobPathname,
      blobUrl,
      createdAt:     Date.now(),
      expiresAt,
      maxDownloads:  MAX_DOWNLOADS,
      downloadCount: 0,
      encrypted:     true,
    };

    await put(`metadata/${code}.json`, JSON.stringify(metadata, null, 2), {
      access:          'private',
      contentType:     'application/json',
      addRandomSuffix: false,
      allowOverwrite:  false,
    });

    console.log(`[upload/complete] Transfert ${code} enregistré — expire ${new Date(expiresAt).toISOString()}`);
    return res.json({ ok: true, deleteToken });

  } catch (err) {
    console.error('[upload/complete] Erreur:', err.message);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement" });
  }
}
