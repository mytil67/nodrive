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
 * Vérifie que le serveur est prêt à traiter un upload.
 * Retourne null si la vérification elle-même échoue (réseau indisponible).
 * @returns {Promise<{ ok: boolean, hasBlobToken: boolean, env: string } | null>}
 */
export async function checkServerHealth() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Upload un fichier chiffré directement depuis le navigateur vers Vercel Blob.
 *
 * Flux :
 *  1. upload() appelle /api/upload pour obtenir un token de téléchargement
 *  2. Le navigateur envoie le fichier chiffré directement au CDN Vercel Blob
 *  3. Vercel Blob appelle le callback /api/upload qui stocke les métadonnées
 *
 * Sécurité : un timeout de 90 s est appliqué pour éviter qu'un blocage silencieux
 * de @vercel/blob/client (notamment quand le serveur retourne 5xx) laisse l'UI
 * indéfiniment à 0 %.
 *
 * @param {string}   code          - code de transfert (6 chars, généré côté client)
 * @param {Uint8Array} encryptedData - données chiffrées (IV + ciphertext)
 * @param {{ originalName: string, size: number }} fileMeta - infos fichier original
 * @param {(pct: number) => void} onProgress - callback progression 0..100
 * @returns {Promise<void>}
 */
export async function uploadEncryptedFile(code, encryptedData, fileMeta, onProgress) {
  const TIMEOUT_MS = 90_000;
  const expiresAt  = Date.now() +
    parseInt(import.meta.env.VITE_EXPIRATION_HOURS || '24', 10) * 3600 * 1000;

  console.log('[upload] Démarrage upload — code:', code, 'taille:', encryptedData.byteLength, 'bytes');

  // onUploadProgress est intentionnellement absent :
  // @vercel/blob/client v2 utilise fetch + ReadableStream (duplex:'half') quand un callback
  // de progression est fourni, ce qui échoue sur le CDN Vercel Blob (connexion coupée à ~96%).
  // Sans callback, fetch classique est utilisé — l'UI reste en mode indéterminé.
  const uploadPromise = upload(
    `transfers/${code}/file.enc`,
    new Blob([encryptedData], { type: 'application/octet-stream' }),
    {
      access:          'public',
      handleUploadUrl: '/api/upload',
      clientPayload: JSON.stringify({
        code,
        originalName: fileMeta.originalName,
        size:         fileMeta.size,
        expiresAt,
      }),
    }
  ).then((result) => {
    console.log('[upload] upload() résolu :', result);
    onProgress(100);
    return result;
  }).catch((err) => {
    console.error('[upload] upload() rejeté :', err.name, err.message, err);
    throw err;
  });

  // Garde-fou : si upload() se bloque silencieusement (ex: serveur renvoie 5xx
  // sans que @vercel/blob/client lève d'exception), on force une erreur après
  // TIMEOUT_MS pour que l'UI ne reste jamais figée à 0 %.
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Upload interrompu : le serveur n'a pas répondu après ${TIMEOUT_MS / 1000} s`)),
      TIMEOUT_MS
    );
  });

  try {
    await Promise.race([uploadPromise, timeoutPromise]);
    console.log('[upload] Terminé avec succès');
  } finally {
    clearTimeout(timeoutId);
  }
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
