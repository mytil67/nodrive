/**
 * Couche d'accès à l'API NoDrive (Vercel Serverless + Vercel Blob).
 *
 * Upload : navigateur → Vercel Blob CDN directement (via @vercel/blob/client).
 *          La Vercel Function /api/upload ne voit que les métadonnées, jamais le fichier.
 * Infos   : GET  /api/file/:code/info
 * Suppression : POST /api/file/:code/delete
 */

import { upload } from '@vercel/blob/client';

/**
 * Upload un fichier chiffré directement depuis le navigateur vers Vercel Blob.
 *
 * Flux :
 *  1. upload() appelle /api/upload pour obtenir un token de téléchargement
 *  2. Le navigateur envoie le fichier chiffré directement au CDN Vercel Blob
 *  3. Vercel Blob appelle le callback /api/upload qui stocke les métadonnées
 *
 * @param {string}   code          - code de transfert (6 chars, généré côté client)
 * @param {Uint8Array} encryptedData - données chiffrées (IV + ciphertext)
 * @param {{ originalName: string, size: number }} fileMeta - infos fichier original
 * @param {(pct: number) => void} onProgress - callback progression 0..100
 * @returns {Promise<void>}
 */
export async function uploadEncryptedFile(code, encryptedData, fileMeta, onProgress) {
  const expiresAt = Date.now() +
    parseInt(import.meta.env.VITE_EXPIRATION_HOURS || '24', 10) * 3600 * 1000;

  await upload(
    `transfers/${code}/file.enc`,
    new Blob([encryptedData], { type: 'application/octet-stream' }),
    {
      access:           'public',
      handleUploadUrl:  '/api/upload',
      clientPayload: JSON.stringify({
        code,
        originalName: fileMeta.originalName,
        size:         fileMeta.size,
        expiresAt,
      }),
      onUploadProgress: ({ percentage }) => {
        if (percentage != null) onProgress(Math.round(percentage));
      },
    }
  );
}

/**
 * Récupère les informations publiques d'un transfert.
 * Ne retourne jamais de clé de chiffrement (elle n'est pas stockée côté serveur).
 *
 * @param {string} code
 * @returns {Promise<{ originalName, size, expiresAt, maxDownloads, downloadCount, blobUrl }>}
 */
export async function getFileInfo(code) {
  const res  = await fetch(`/api/file/${encodeURIComponent(code)}/info`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erreur HTTP ${res.status}`);
  return body;
}

/**
 * Supprime un transfert (fichier chiffré + métadonnées).
 * Appelé après un téléchargement réussi si maxDownloads === 1 (usage unique).
 * Fire-and-forget : les erreurs sont ignorées silencieusement.
 *
 * @param {string} code
 * @returns {Promise<void>}
 */
export async function deleteTransfer(code) {
  try {
    await fetch(`/api/file/${encodeURIComponent(code)}/delete`, { method: 'POST' });
  } catch {
    // Suppression best-effort : le cron quotidien nettoiera si nécessaire
  }
}
