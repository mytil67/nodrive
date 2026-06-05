/**
 * POST /api/upload/authorize
 *
 * Génère un token client pour l'upload direct vers Vercel Blob.
 * Valide les métadonnées avant d'autoriser l'upload.
 *
 * Utilisé par @vercel/blob/client upload() côté navigateur.
 */

import { handleUpload } from '@vercel/blob/client';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10);
const CODE_REGEX = /^[A-Z2-9]{6}$/;
const SALT_REGEX = /^[0-9a-f]{32}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let meta;
        try { meta = JSON.parse(clientPayload); } catch {
          throw new Error('Payload invalide');
        }

        const { code, salt, size } = meta;
        if (!CODE_REGEX.test(code)) throw new Error('Code invalide');
        if (!SALT_REGEX.test(salt)) throw new Error('Sel invalide');
        if (!size || size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          throw new Error(`Trop volumineux (max ${MAX_FILE_SIZE_MB} Mo)`);
        }

        return {
          allowedContentTypes: ['application/octet-stream'],
          maximumSizeInBytes: MAX_FILE_SIZE_MB * 1024 * 1024 + 128,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },

      // Métadonnées créées via /api/upload/complete, pas ici
      onUploadCompleted: async () => {},
    });

    return res.json(jsonResponse);
  } catch (err) {
    console.error('[upload/authorize] Erreur:', err.message);
    return res.status(400).json({ error: err.message });
  }
}
