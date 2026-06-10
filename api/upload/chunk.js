/**
 * POST /api/upload/chunk
 *
 * Reçoit un chunk de fichier chiffré (max ~3.5 Mo) et le stocke dans Vercel Blob.
 * Supporte le multi-fichier : chaque fichier a son propre préfixe (f000, f001…).
 *
 * Headers requis :
 *   x-blob-code        : code de transfert (6 chars)
 *   x-chunk-index       : index du chunk dans le fichier courant (0-based)
 *   x-chunk-total       : nombre total de chunks pour le fichier courant
 *   x-file-index        : index du fichier (0-based), défaut 0
 *   x-file-total        : nombre total de fichiers, défaut 1
 *
 * Sur le dernier chunk du dernier fichier :
 *   x-blob-salt         : sel PBKDF2 256 bits hex
 *   x-blob-files        : JSON array de { name, size } pour chaque fichier
 */

import { put, list } from '@vercel/blob';
import { randomBytes } from 'crypto';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10);
const EXPIRATION_HOURS = parseInt(process.env.EXPIRATION_HOURS || '1', 10);
const MAX_DOWNLOADS    = parseInt(process.env.MAX_DOWNLOADS    || '1',  10);
const MAX_CHUNK_BYTES  = 4 * 1024 * 1024;
const MAX_FILES        = 50;
const MAX_CHUNKS_PER_FILE = 100;

const CODE_REGEX = /^[A-Z2-9]{6}$/;
const SALT_REGEX = /^[0-9a-f]{64}$/;

function sanitizeFilename(name) {
  let sanitized = String(name)
    .normalize('NFC')
    .trim();

  // Supprimer les séparateurs de chemin
  sanitized = sanitized.replace(/[\\/]/g, '_');

  // Supprimer les caractères de contrôle et null bytes
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  // Ne garder que les caractères sûrs (alphanum, points, tirets, underscores, espaces, unicode)
  sanitized = sanitized.replace(/[^a-zA-Z0-9._\-\u0080-\uFFFF ]/g, '_');

  // Tronquer
  sanitized = sanitized.substring(0, 200).trim();

  return sanitized || 'fichier';
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
  const fileIndex  = parseInt(req.headers['x-file-index']  || '0', 10);
  const fileTotal  = parseInt(req.headers['x-file-total']  || '1', 10);
  const salt       = req.headers['x-blob-salt'] || '';
  const filesJson  = req.headers['x-blob-files'] || '';

  // Validations
  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Code invalide' });
  }
  if (chunkIndex < 0 || chunkTotal < 1 || chunkIndex >= chunkTotal || chunkTotal > MAX_CHUNKS_PER_FILE) {
    return res.status(400).json({ error: 'Index de chunk invalide' });
  }
  if (fileIndex < 0 || fileTotal < 1 || fileIndex >= fileTotal || fileTotal > MAX_FILES) {
    return res.status(400).json({ error: 'Index de fichier invalide' });
  }

  // Vérifier qu'on n'écrase pas un transfert existant (premier chunk du premier fichier)
  if (fileIndex === 0 && chunkIndex === 0) {
    const { blobs: existing } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    if (existing.length) {
      return res.status(409).json({ error: 'Code déjà utilisé — réessayez' });
    }
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
    // Stocker le chunk : f{fileIdx}-chunk-{chunkIdx}.enc
    const paddedFile  = String(fileIndex).padStart(3, '0');
    const paddedChunk = String(chunkIndex).padStart(3, '0');
    await put(`transfers/${code}/f${paddedFile}-chunk-${paddedChunk}.enc`, body, {
      access:          'private',
      contentType:     'application/octet-stream',
      addRandomSuffix: false,
      allowOverwrite:  false,
    });

    // Dernier chunk du dernier fichier → créer les métadonnées
    const isLastChunk = (chunkIndex === chunkTotal - 1) && (fileIndex === fileTotal - 1);

    if (isLastChunk) {
      if (!SALT_REGEX.test(salt)) {
        return res.status(400).json({ error: 'Sel invalide' });
      }

      let fileMetas;
      try {
        fileMetas = JSON.parse(filesJson);
        if (!Array.isArray(fileMetas) || fileMetas.length !== fileTotal) {
          throw new Error('invalid');
        }
        // Validation stricte de chaque fichier
        for (const meta of fileMetas) {
          if (typeof meta.size !== 'number' || meta.size < 0 || !Number.isFinite(meta.size)) {
            throw new Error('invalid size');
          }
          if (typeof meta.name !== 'string' || meta.name.length === 0 || meta.name.length > 500) {
            throw new Error('invalid name');
          }
        }
      } catch {
        return res.status(400).json({ error: 'Métadonnées des fichiers invalides' });
      }

      // Valider la taille totale
      const totalSize = fileMetas.reduce((s, f) => s + f.size, 0);
      if (!totalSize || totalSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
        return res.status(400).json({ error: `Taille totale trop grande (max ${MAX_FILE_SIZE_MB} Mo)` });
      }

      // Lister tous les chunks et grouper par fichier
      const { blobs: allChunks } = await list({ prefix: `transfers/${code}/`, limit: 1000 });
      const sorted = allChunks.sort((a, b) => a.pathname.localeCompare(b.pathname));

      const files = [];
      for (let f = 0; f < fileTotal; f++) {
        const prefix = `f${String(f).padStart(3, '0')}-chunk-`;
        const fileChunks = sorted.filter(b => b.pathname.includes(prefix));

        // Valider la complétude : chaque fichier doit avoir exactement le bon nombre de chunks
        const expectedCount = (f === fileTotal - 1 && f === fileIndex)
          ? chunkTotal   // dernier fichier : on connaît chunkTotal depuis le header
          : fileChunks.length; // fichiers précédents : déjà uploadés
        if (fileChunks.length < 1) {
          return res.status(400).json({ error: `Fichier ${f} : aucun chunk reçu` });
        }
        // Vérifier que les indices sont continus (0, 1, 2, …, N-1)
        for (let c = 0; c < fileChunks.length; c++) {
          const expectedName = `f${String(f).padStart(3, '0')}-chunk-${String(c).padStart(3, '0')}.enc`;
          if (!fileChunks[c].pathname.endsWith(expectedName)) {
            return res.status(400).json({ error: `Fichier ${f} : chunk ${c} manquant ou dans le désordre` });
          }
        }

        files.push({
          originalName: sanitizeFilename(fileMetas[f].name),
          size:         fileMetas[f].size,
          chunkCount:   fileChunks.length,
          chunkUrls:    fileChunks.map(b => b.url),
        });
      }

      const encryptedSize = sorted.reduce((sum, b) => sum + b.size, 0);
      const deleteToken   = randomBytes(16).toString('hex');
      const expiresAt     = Date.now() + EXPIRATION_HOURS * 3600 * 1000;

      const metadata = {
        code,
        salt,
        deleteToken,
        files,
        totalSize,
        encryptedSize,
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

      console.log(`[upload/chunk] Transfert ${code} complet — ${fileTotal} fichier(s)`);
      return res.json({ ok: true, deleteToken });
    }

    return res.json({ ok: true });

  } catch (err) {
    console.error('[upload/chunk] Erreur:', err.message);
    return res.status(500).json({ error: 'Erreur lors du stockage' });
  }
}
