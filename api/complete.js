/**
 * POST /api/complete
 *
 * Appelé par le navigateur après que upload() a résolu avec succès.
 * Stocke les métadonnées du transfert dans Vercel Blob (metadata/{code}.json).
 *
 * Body attendu :
 *   { code, blobUrl, blobPathname, originalName, size, expiresAt }
 */

import { put } from '@vercel/blob';

const EXPIRATION_HOURS = parseInt(process.env.EXPIRATION_HOURS || '24', 10);
const MAX_DOWNLOADS    = parseInt(process.env.MAX_DOWNLOADS    || '1',  10);
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10);

const CODE_REGEX      = /^[A-Z2-9]{6}$/;
const BLOB_URL_REGEX  = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

function sanitizeFilename(name) {
  return String(name)
    .replace(/.*[\\/]/, '')
    .replace(/[^a-zA-Z0-9.\-_ ]/g, '_')
    .substring(0, 200)
    .trim() || 'fichier';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== null && req.body !== undefined && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return resolve(req.body);
    }
    if (typeof req.body === 'string') {
      try { return resolve(JSON.parse(req.body)); } catch { return resolve({}); }
    }
    if (Buffer.isBuffer(req.body)) {
      try { return resolve(JSON.parse(req.body.toString('utf8'))); } catch { return resolve({}); }
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'Configuration serveur incomplète.' });
  }

  const body = await readBody(req);
  const { code, blobUrl, blobPathname, originalName, size } = body || {};

  // Validation
  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Code invalide' });
  }
  if (!blobUrl || !BLOB_URL_REGEX.test(blobUrl)) {
    return res.status(400).json({ error: 'URL blob invalide' });
  }
  if (!blobPathname || !blobPathname.startsWith(`transfers/${code}/`)) {
    return res.status(400).json({ error: 'Pathname blob invalide' });
  }
  const sizeBytes = parseInt(size, 10);
  if (!sizeBytes || sizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return res.status(400).json({ error: 'Taille invalide' });
  }

  const expiresAt = Date.now() + EXPIRATION_HOURS * 3600 * 1000;

  const meta = {
    code,
    originalName: sanitizeFilename(String(originalName || 'fichier')),
    size:         sizeBytes,
    blobPathname,
    blobUrl,
    createdAt:     Date.now(),
    expiresAt,
    maxDownloads:  MAX_DOWNLOADS,
    downloadCount: 0,
    encrypted:     true,
  };

  try {
    await put(`metadata/${code}.json`, JSON.stringify(meta, null, 2), {
      access:          'public',
      contentType:     'application/json',
      addRandomSuffix: false,
      allowOverwrite:  true,
    });

    console.log(`[complete] Transfert ${code} enregistré — expire ${new Date(expiresAt).toISOString()}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[complete] Erreur put metadata:', err.message);
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement des métadonnées' });
  }
}
