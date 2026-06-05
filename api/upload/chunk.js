/**
 * POST /api/upload/chunk
 *
 * Reçoit un chunk de fichier chiffré (max ~3.5 Mo) et le stocke dans Vercel Blob.
 * Sur le dernier chunk, crée les métadonnées du transfert et retourne le deleteToken.
 *
 * Headers requis :
 *   x-blob-code        : code de transfert (6 chars)
 *   x-chunk-index       : index du chunk (0-based)
 *   x-chunk-total       : nombre total de chunks
 *   x-blob-name         : nom original du fichier (encodé URI)
 *   x-blob-size         : taille originale en octets
 *   x-blob-salt         : sel PBKDF2 128 bits hex
 */

import { put, list } from '@vercel/blob';
import { randomBytes } from 'crypto';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10);
const EXPIRATION_HOURS = parseInt(process.env.EXPIRATION_HOURS || '24', 10);
const MAX_DOWNLOADS    = parseInt(process.env.MAX_DOWNLOADS    || '1',  10);
const MAX_CHUNK_BYTES  = 4 * 1024 * 1024; // 4 Mo max par chunk

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

// Désactiver le body parser Vercel — on lit le body binaire manuellement
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const code       = req.headers['x-blob-code'] || '';
  const chunkIndex = parseInt(req.headers['x-chunk-index'] || '-1', 10);
  const chunkTotal = parseInt(req.headers['x-chunk-total'] || '0', 10);
  const salt       = req.headers['x-blob-salt'] || '';
  const originalName = req.headers['x-blob-name'] ? decodeURIComponent(req.headers['x-blob-name']).replace(/\0/g, '') : '';
  const sizeBytes  = parseInt(req.headers['x-blob-size'] || '0', 10);

  // Validations
  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Code invalide' });
  }
  if (chunkIndex < 0 || chunkTotal < 1 || chunkIndex >= chunkTotal) {
    return res.status(400).json({ error: 'Index de chunk invalide' });
  }
  if (chunkTotal > Math.ceil((MAX_FILE_SIZE_MB * 1024 * 1024) / (3 * 1024 * 1024)) + 1) {
    return res.status(400).json({ error: 'Trop de chunks' });
  }

  // Lire le body du chunk
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_CHUNK_BYTES) {
      return res.status(413).json({ error: 'Chunk trop volumineux' });
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks, totalBytes);

  try {
    // Stocker le chunk avec un index zero-padded pour le tri
    const paddedIndex = String(chunkIndex).padStart(3, '0');
    await put(`transfers/${code}/chunk-${paddedIndex}.enc`, body, {
      access:          'private',
      contentType:     'application/octet-stream',
      addRandomSuffix: false,
      allowOverwrite:  true,
    });

    // Dernier chunk → créer les métadonnées
    if (chunkIndex === chunkTotal - 1) {
      if (!SALT_REGEX.test(salt)) {
        return res.status(400).json({ error: 'Sel invalide' });
      }
      if (!originalName) {
        return res.status(400).json({ error: 'Nom de fichier manquant' });
      }
      if (!sizeBytes || sizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
        return res.status(400).json({ error: `Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)` });
      }

      // Lister tous les chunks pour obtenir leurs URLs et la taille totale
      const { blobs: chunkBlobs } = await list({ prefix: `transfers/${code}/chunk-`, limit: 100 });
      const sortedChunks = chunkBlobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
      const chunkUrls = sortedChunks.map(b => b.url);
      const encryptedSize = sortedChunks.reduce((sum, b) => sum + b.size, 0);

      if (chunkUrls.length !== chunkTotal) {
        return res.status(400).json({ error: `Chunks manquants : ${chunkUrls.length}/${chunkTotal}` });
      }

      const deleteToken = randomBytes(16).toString('hex');
      const expiresAt   = Date.now() + EXPIRATION_HOURS * 3600 * 1000;

      const metadata = {
        code,
        originalName:   sanitizeFilename(originalName),
        size:           sizeBytes,
        salt,
        deleteToken,
        chunkCount:     chunkTotal,
        chunkUrls,
        encryptedSize,
        createdAt:      Date.now(),
        expiresAt,
        maxDownloads:   MAX_DOWNLOADS,
        downloadCount:  0,
        encrypted:      true,
      };

      await put(`metadata/${code}.json`, JSON.stringify(metadata, null, 2), {
        access:          'private',
        contentType:     'application/json',
        addRandomSuffix: false,
        allowOverwrite:  true,
      });

      console.log(`[upload/chunk] Transfert ${code} complet — ${chunkTotal} chunks, ${encryptedSize} bytes`);
      return res.json({ ok: true, deleteToken });
    }

    return res.json({ ok: true, chunk: chunkIndex });

  } catch (err) {
    console.error('[upload/chunk] Erreur:', err.message, err.stack);
    return res.status(500).json({ error: `Erreur upload chunk ${chunkIndex}: ${err.message}` });
  }
}
