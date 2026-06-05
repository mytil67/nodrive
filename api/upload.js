/**
 * POST /api/upload
 *
 * Gère le cycle de vie de l'upload client vers Vercel Blob :
 *  1. onBeforeGenerateToken — valide le payload, retourne la config du token
 *  2. onUploadCompleted    — stocke les métadonnées JSON dans Vercel Blob
 *
 * Le fichier transite directement navigateur → Vercel Blob CDN.
 * Cette Function ne voit jamais le contenu du fichier, seulement les métadonnées.
 * La clé de chiffrement n'est jamais envoyée ici.
 */

import { handleUpload } from '@vercel/blob/client';
import { put } from '@vercel/blob';

const MAX_FILE_SIZE_MB   = parseInt(process.env.MAX_FILE_SIZE_MB  || '25', 10);
const EXPIRATION_HOURS   = parseInt(process.env.EXPIRATION_HOURS  || '24', 10);
const MAX_DOWNLOADS      = parseInt(process.env.MAX_DOWNLOADS     || '1',  10);

/** Format attendu pour un code de transfert. */
const CODE_REGEX = /^[A-Z2-9]{6}$/;

/**
 * Nettoie un nom de fichier pour supprimer les caractères dangereux.
 * Empêche le path traversal et les noms trop longs.
 */
function sanitizeFilename(name) {
  return String(name)
    .replace(/.*[\\/]/, '')               // retire tout préfixe de chemin
    .replace(/[^a-zA-Z0-9.\-_ ]/g, '_')  // caractères autorisés uniquement
    .substring(0, 200)
    .trim() || 'fichier';
}

/**
 * Lit et parse le body de la requête Node.js en JSON.
 * Vercel Functions ne parsent pas automatiquement le body.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    // Déjà parsé par un middleware Vercel
    if (req.body !== undefined && typeof req.body === 'object') {
      return resolve(req.body);
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const body = await readBody(req);

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,

      /**
       * Appelé avant la génération du token client.
       * Valide les données envoyées par le navigateur et configure l'upload.
       */
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload;
        try {
          payload = JSON.parse(clientPayload);
        } catch {
          throw new Error('Payload invalide');
        }

        // Validation du code
        if (!CODE_REGEX.test(payload.code)) {
          throw new Error('Code de transfert invalide');
        }

        // Validation de la taille
        const sizeBytes = parseInt(payload.size, 10);
        if (!sizeBytes || sizeBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
          throw new Error(`Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)`);
        }

        // Validation du nom
        if (!payload.originalName || typeof payload.originalName !== 'string') {
          throw new Error('Nom de fichier invalide');
        }

        return {
          // Seuls les fichiers binaires chiffrés sont acceptés
          allowedContentTypes: ['application/octet-stream'],
          maximumSizeInBytes: MAX_FILE_SIZE_MB * 1024 * 1024,
          // Le pathname est contrôlé côté client (transfers/{code}/file.enc)
          addRandomSuffix: false,
          // tokenPayload est retransmis tel quel à onUploadCompleted
          tokenPayload: JSON.stringify({
            code:         payload.code,
            originalName: sanitizeFilename(payload.originalName),
            size:         sizeBytes,
            expiresAt:    Date.now() + EXPIRATION_HOURS * 3600 * 1000,
          }),
        };
      },

      /**
       * Appelé par l'infrastructure Vercel Blob après upload réussi.
       * Stocke les métadonnées publiques sous metadata/{code}.json dans Vercel Blob.
       * NE contient pas la clé de chiffrement.
       */
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { code, originalName, size, expiresAt } = JSON.parse(tokenPayload);

        const meta = {
          code,
          originalName,
          size,
          blobPathname: blob.pathname,
          blobUrl:      blob.url,
          createdAt:    Date.now(),
          expiresAt,
          maxDownloads: MAX_DOWNLOADS,
          downloadCount: 0,
          encrypted:    true,
        };

        await put(`metadata/${code}.json`, JSON.stringify(meta, null, 2), {
          access:          'public',
          contentType:     'application/json',
          addRandomSuffix: false,
          allowOverwrite:  true,
        });

        console.log(`[upload] Transfert ${code} enregistré — expire ${new Date(expiresAt).toISOString()}`);
      },
    });

    return res.json(jsonResponse);
  } catch (err) {
    console.error('[upload] Erreur :', err.message);
    return res.status(400).json({ error: err.message });
  }
}
