/**
 * Couche d'accès à l'API NoDrive (Vercel Serverless + Vercel Blob).
 *
 * Upload : navigateur → Vercel Blob CDN (via @vercel/blob/client upload())
 *          puis POST /api/complete pour stocker les métadonnées.
 * Infos  : GET  /api/file/:code/info
 * Suppression : POST /api/file/:code/delete
 */

import { upload } from '@vercel/blob/client';

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
 * Upload un fichier chiffré vers Vercel Blob puis enregistre les métadonnées.
 *
 * Flux :
 *  1. upload() → /api/upload pour obtenir le token, puis PUT direct vers le CDN
 *  2. upload() résout avec { url, pathname, ... }
 *  3. POST /api/complete pour stocker metadata/{code}.json
 *
 * Le callback CDN→serveur (onUploadCompleted) est volontairement absent :
 * il causait des blocages indéfinis avec @vercel/blob v2 + fetch streaming.
 *
 * @param {string}     code          - code de transfert (6 chars)
 * @param {Uint8Array} encryptedData - données chiffrées (IV + ciphertext)
 * @param {{ originalName: string, size: number }} fileMeta
 * @param {(pct: number) => void} onProgress
 */
export async function uploadEncryptedFile(code, encryptedData, fileMeta, onProgress) {
  const TIMEOUT_MS = 120_000; // 2 min
  const expiresAt  = Date.now() +
    parseInt(import.meta.env.VITE_EXPIRATION_HOURS || '24', 10) * 3600 * 1000;

  console.log('[upload] Démarrage — code:', code, 'taille:', encryptedData.byteLength, 'bytes');

  const uploadPromise = (async () => {
    // Étape 1 : upload vers le CDN
    const result = await upload(
      `transfers/${code}/file.enc`,
      new Blob([encryptedData], { type: 'application/octet-stream' }),
      {
        access:          'public',
        handleUploadUrl: '/api/upload',
        clientPayload:   JSON.stringify({
          code,
          originalName: fileMeta.originalName,
          size:         fileMeta.size,
        }),
      }
    );
    console.log('[upload] CDN upload résolu — url:', result.url);

    // Étape 2 : enregistrement des métadonnées
    const res = await fetch('/api/complete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        blobUrl:      result.url,
        blobPathname: result.pathname,
        originalName: fileMeta.originalName,
        size:         fileMeta.size,
        expiresAt,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Erreur /api/complete : HTTP ${res.status}`);
    }

    console.log('[upload] Métadonnées enregistrées');
    onProgress(100);
  })().catch((err) => {
    console.error('[upload] Erreur:', err.name, err.message);
    throw err;
  });

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Upload interrompu : pas de réponse après ${TIMEOUT_MS / 1000} s`)),
      TIMEOUT_MS
    );
  });

  try {
    await Promise.race([uploadPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getFileInfo(code) {
  const res  = await fetch(`/api/file/${encodeURIComponent(code)}/info`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erreur HTTP ${res.status}`);
  return body;
}

export async function deleteTransfer(code) {
  try {
    await fetch(`/api/file/${encodeURIComponent(code)}/delete`, { method: 'POST' });
  } catch {
    // best-effort
  }
}
