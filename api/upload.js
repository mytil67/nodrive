/**
 * POST /api/upload
 *
 * Génère le token client pour l'upload direct navigateur → Vercel Blob CDN.
 * Cette Function ne voit jamais le contenu du fichier, seulement les métadonnées.
 *
 * IMPORTANT : onUploadCompleted est intentionnellement absent.
 * Le callback CDN→serveur causait des blocages indéfinis avec @vercel/blob v2.
 * Les métadonnées sont stockées par /api/complete, appelé par le navigateur
 * après que upload() résout.
 */

import { handleUpload } from '@vercel/blob/client';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10);

/** Format attendu pour un code de transfert. */
const CODE_REGEX = /^[A-Z2-9]{6}$/;

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
    return res.status(500).json({ error: 'Configuration serveur incomplète : BLOB_READ_WRITE_TOKEN absent.' });
  }

  const body = await readBody(req);
  if (!body || !body.type) {
    return res.status(400).json({ error: 'Corps de requête invalide' });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload;
        try { payload = JSON.parse(clientPayload); }
        catch { throw new Error('Payload invalide'); }

        if (!CODE_REGEX.test(payload.code)) throw new Error('Code de transfert invalide');

        const sizeBytes = parseInt(payload.size, 10);
        if (!sizeBytes || sizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
          throw new Error(`Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)`);
        }

        if (!payload.originalName || typeof payload.originalName !== 'string') {
          throw new Error('Nom de fichier invalide');
        }

        console.log('[upload] token généré pour code:', payload.code);

        return {
          allowedContentTypes: ['application/octet-stream'],
          maximumSizeInBytes:  MAX_FILE_SIZE_MB * 1024 * 1024,
          addRandomSuffix:     false,
          // Pas de callbackUrl : onUploadCompleted géré via /api/complete
          tokenPayload: JSON.stringify({
            code:         payload.code,
            originalName: sanitizeFilename(payload.originalName),
            size:         sizeBytes,
          }),
        };
      },

      // Pas de onUploadCompleted → pas de callback CDN→serveur dans le token
    });

    return res.json(jsonResponse);
  } catch (err) {
    console.error('[upload] Erreur:', err.message);
    const isDev = process.env.VERCEL_ENV !== 'production';
    return res.status(400).json({
      error: isDev ? err.message : 'Erreur lors de la génération du token d\'upload',
    });
  }
}
