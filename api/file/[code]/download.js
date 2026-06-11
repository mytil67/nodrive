/**
 * GET /api/file/:code/download
 *
 * Proxy serveur pour télécharger un chunk de fichier chiffré.
 * Paramètres query : ?file=0&chunk=0
 *
 * Gestion du quota : ce endpoint ne fait que VÉRIFIER le quota (lecture seule).
 * La consommation réelle (incrément + suppression) est déclenchée par le client
 * via POST .../confirm, une fois le déchiffrement réussi. Ainsi un mauvais mot
 * de passe ou un téléchargement interrompu ne consomme ni ne détruit rien.
 */

import { list } from '@vercel/blob';
import { timingSafeEqual } from 'crypto';

const CODE_REGEX     = /^[A-Z2-9]{6}$/;
const VERIFIER_REGEX = /^[0-9a-f]{64}$/;

/** Comparaison en temps constant de deux chaînes hex de même format. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const code = (req.query.code || '').toString().toUpperCase();
  if (!CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Format de code invalide' });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const rawFile  = parseInt(req.query.file  || '0', 10);
  const rawChunk = parseInt(req.query.chunk || '0', 10);
  const fileIndex  = (Number.isFinite(rawFile)  && rawFile  >= 0) ? Math.min(rawFile, 999)  : 0;
  const chunkIndex = (Number.isFinite(rawChunk) && rawChunk >= 0) ? Math.min(rawChunk, 9999) : 0;

  try {
    // 1. Lecture des métadonnées
    const { blobs: metaBlobs } = await list({ prefix: `metadata/${code}.json`, limit: 1 });
    if (!metaBlobs.length) {
      return res.status(404).json({ error: 'Code invalide ou expiré' });
    }

    const metaResponse = await fetch(metaBlobs[0].url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaResponse.ok) {
      return res.status(404).json({ error: 'Métadonnée introuvable' });
    }
    const meta = await metaResponse.json();

    if (Date.now() > meta.expiresAt) {
      return res.status(410).json({ error: 'Ce fichier a expiré' });
    }

    if (!meta.files || !meta.files.length) {
      return res.status(410).json({ error: 'Format de transfert non supporté' });
    }

    // Preuve de connaissance du mot de passe : le ciphertext n'est servi
    // qu'aux clients capables de dériver le verifier (anti brute-force offline).
    if (meta.verifier) {
      const provided = (req.headers['x-blob-verifier'] || '').toLowerCase();
      if (!VERIFIER_REGEX.test(provided) || !safeEqual(provided, meta.verifier)) {
        return res.status(403).json({ error: 'Mot de passe incorrect' });
      }
    }

    const files = meta.files;

    // Validation des index
    if (fileIndex >= files.length) {
      return res.status(400).json({ error: 'Index de fichier invalide' });
    }

    const file = files[fileIndex];
    if (!file.chunkUrls || !file.chunkUrls.length) {
      return res.status(410).json({ error: 'Fichier sans chunks' });
    }

    // Vérification du quota en LECTURE SEULE. Aucune écriture ici : la
    // consommation a lieu via POST .../confirm après déchiffrement réussi.
    if (meta.maxDownloads > 0 && meta.downloadCount >= meta.maxDownloads) {
      return res.status(410).json({ error: 'Nombre maximum de téléchargements atteint' });
    }

    // Validation index chunk
    if (chunkIndex >= file.chunkUrls.length) {
      return res.status(400).json({ error: 'Index de chunk invalide' });
    }

    // Télécharger et streamer le chunk
    const chunkUrl = file.chunkUrls[chunkIndex];
    const chunkResponse = await fetch(chunkUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!chunkResponse.ok) {
      return res.status(404).json({ error: 'Chunk introuvable' });
    }

    const contentLength = chunkResponse.headers.get('content-length');
    res.setHeader('Content-Type', 'application/octet-stream');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const reader = chunkResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (streamErr) {
      console.error(`[download] Erreur stream :`, streamErr.message);
      if (!res.writableEnded) res.end();
    }

  } catch (err) {
    console.error('[download] Erreur :', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erreur lors du téléchargement' });
    }
  }
}
