/**
 * POST /api/upload
 *
 * Reçoit le fichier chiffré depuis le navigateur (corps binaire brut)
 * et le stocke dans Vercel Blob via put() côté serveur.
 * La clé de chiffrement n'est JAMAIS envoyée ici (elle reste dans le fragment # de l'URL).
 *
 * Métadonnées transmises via en-têtes HTTP personnalisés :
 *   x-blob-code      : code de transfert (6 chars, ex: ABCD12)
 *   x-blob-name      : nom original du fichier (encodé URI)
 *   x-blob-size      : taille originale en octets
 *
 * Avantage par rapport à @vercel/blob/client :
 *   Le upload client-side de @vercel/blob v2 envoie vers vercel.com/api/blob
 *   (API management) qui ne supporte pas CORS — cassé pour les navigateurs.
 *   Cette approche proxy évite complètement ce problème.
 */

import { put } from '@vercel/blob';
import { randomBytes } from 'crypto';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10);
const EXPIRATION_HOURS = parseInt(process.env.EXPIRATION_HOURS || '24', 10);
const MAX_DOWNLOADS    = parseInt(process.env.MAX_DOWNLOADS    || '1',  10);

const CODE_REGEX = /^[A-Z2-9]{6}$/;

function sanitizeFilename(name) {
  let sanitized = String(name)
    .normalize('NFC')
    .trim();
  sanitized = sanitized.replace(/[\\/]/g, '_');
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  sanitized = sanitized.replace(/[^a-zA-Z0-9._\-\u0080-\uFFFF ]/g, '_');
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

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'Configuration serveur incomplète : BLOB_READ_WRITE_TOKEN absent.' });
  }

  // Lecture des métadonnées depuis les en-têtes
  const code         = req.headers['x-blob-code'] || '';
  const originalName = req.headers['x-blob-name'] ? decodeURIComponent(req.headers['x-blob-name']).replace(/\0/g, '') : '';
  const sizeBytes    = parseInt(req.headers['x-blob-size'] || '0', 10);
  const salt         = req.headers['x-blob-salt'] || '';

  const SALT_REGEX = /^[0-9a-f]{32}$/;

  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Code de transfert invalide' });
  }
  if (!sizeBytes || sizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return res.status(400).json({ error: `Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)` });
  }
  if (!originalName) {
    return res.status(400).json({ error: 'Nom de fichier manquant' });
  }
  if (!SALT_REGEX.test(salt)) {
    return res.status(400).json({ error: 'Sel cryptographique invalide' });
  }

  const expiresAt   = Date.now() + EXPIRATION_HOURS * 3600 * 1000;
  const deleteToken = randomBytes(16).toString('hex');

  // Vérification de la taille réelle du body (le header Content-Length peut mentir)
  const maxBodyBytes = MAX_FILE_SIZE_MB * 1024 * 1024 + 128; // marge pour IV + tag GCM
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > maxBodyBytes) {
    return res.status(413).json({ error: `Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)` });
  }

  try {
    // Collecter le body pour vérifier la taille réelle avant de stocker
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > maxBodyBytes) {
        return res.status(413).json({ error: `Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)` });
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks, totalBytes);

    const blob = await put(`transfers/${code}/file.enc`, body, {
      access:          'private',
      contentType:     'application/octet-stream',
      addRandomSuffix: false,
      allowOverwrite:  false, // refuse si le code est déjà utilisé
    });

    console.log('[upload] Fichier stocké :', blob.pathname);

    // Stockage des métadonnées (sans clé de chiffrement)
    const meta = {
      code,
      originalName:  sanitizeFilename(originalName),
      size:          sizeBytes,
      salt,                    // sel PBKDF2 128 bits (hex) — public, pas secret
      deleteToken,             // token 128 bits requis pour DELETE — jamais renvoyé via /info
      blobPathname:  blob.pathname,
      blobUrl:       blob.url,
      createdAt:     Date.now(),
      expiresAt,
      maxDownloads:  MAX_DOWNLOADS,
      downloadCount: 0,
      encrypted:     true,
    };

    await put(`metadata/${code}.json`, JSON.stringify(meta, null, 2), {
      access:          'private',
      contentType:     'application/json',
      addRandomSuffix: false,
      allowOverwrite:  false,
    });

    console.log(`[upload] Transfert ${code} enregistré — expire ${new Date(expiresAt).toISOString()}`);
    // deleteToken retourné une seule fois — l'expéditeur doit le conserver pour annuler
    return res.json({ ok: true, deleteToken });

  } catch (err) {
    console.error('[upload] Erreur:', err.message);
    return res.status(500).json({ error: "Erreur lors de l'upload" });
  }
}
