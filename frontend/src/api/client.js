/**
 * Couche d'accès à l'API NoDrive.
 *
 * Upload : deux modes selon la taille du fichier chiffré :
 *  - <= 4 Mo : XHR direct vers /api/upload (proxy serveur, simple)
 *  - > 4 Mo  : @vercel/blob/client upload direct vers Blob Storage
 *              + /api/upload/complete pour les métadonnées
 */

import { upload } from '@vercel/blob/client';

const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 Mo — limite body Vercel Serverless

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
 * Upload un fichier chiffré — choisit automatiquement la méthode.
 *
 * @param {string}     code          - code de transfert (6 chars)
 * @param {Uint8Array} encryptedData - données chiffrées (IV + ciphertext)
 * @param {{ originalName: string, size: number, salt: string }} fileMeta
 * @param {(pct: number) => void} onProgress
 * @returns {Promise<string|null>} deleteToken
 */
export async function uploadEncryptedFile(code, encryptedData, fileMeta, onProgress) {
  if (encryptedData.byteLength <= DIRECT_UPLOAD_LIMIT) {
    return uploadViaProxy(code, encryptedData, fileMeta, onProgress);
  }
  return uploadViaClient(code, encryptedData, fileMeta, onProgress);
}

/**
 * Upload direct via XHR → /api/upload (fichiers <= 4 Mo).
 */
function uploadViaProxy(code, encryptedData, fileMeta, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.timeout = 120_000;

    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('x-blob-code', code);
    xhr.setRequestHeader('x-blob-name', encodeURIComponent(fileMeta.originalName));
    xhr.setRequestHeader('x-blob-size', String(fileMeta.size));
    xhr.setRequestHeader('x-blob-salt', fileMeta.salt);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.min(Math.round((e.loaded / e.total) * 100), 99));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        try {
          const body = JSON.parse(xhr.responseText);
          resolve(body.deleteToken || null);
        } catch { resolve(null); }
      } else {
        let msg = `Erreur HTTP ${xhr.status}`;
        try { const b = JSON.parse(xhr.responseText); if (b.error) msg = b.error; } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error',   () => reject(new Error('Erreur réseau')));
    xhr.addEventListener('abort',   () => reject(new Error('Upload annulé')));
    xhr.addEventListener('timeout', () => reject(new Error('Délai dépassé (2 min)')));

    xhr.send(encryptedData);
  });
}

/**
 * Upload direct vers Vercel Blob via @vercel/blob/client (fichiers > 4 Mo).
 * Le fichier va directement du navigateur au Blob Storage.
 * Les métadonnées sont créées ensuite via /api/upload/complete.
 */
async function uploadViaClient(code, encryptedData, fileMeta, onProgress) {
  // Convertir en Blob — le SDK @vercel/blob/client le gère mieux que Uint8Array brut
  const file = new Blob([encryptedData], { type: 'application/octet-stream' });

  const blob = await upload(`transfers/${code}/file.enc`, file, {
    access: 'private',
    handleUploadUrl: '/api/upload/authorize',
    contentType: 'application/octet-stream',
    clientPayload: JSON.stringify({
      code,
      originalName: fileMeta.originalName,
      size: fileMeta.size,
      salt: fileMeta.salt,
    }),
    multipart: encryptedData.byteLength > 8 * 1024 * 1024, // multipart au-delà de 8 Mo
    onUploadProgress: ({ percentage }) => {
      onProgress(Math.min(Math.round(percentage), 95));
    },
  });

  onProgress(98);

  // Enregistrer les métadonnées et récupérer le deleteToken
  const res = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      originalName: fileMeta.originalName,
      size: fileMeta.size,
      salt: fileMeta.salt,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erreur enregistrement métadonnées');

  onProgress(100);
  return body.deleteToken || null;
}

export async function getFileInfo(code) {
  const res  = await fetch(`/api/file/${encodeURIComponent(code)}/info`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erreur HTTP ${res.status}`);
  return body;
}

export async function cancelTransfer(code, deleteToken) {
  const res = await fetch(`/api/file/${encodeURIComponent(code)}/delete`, {
    method: 'POST',
    headers: { 'x-delete-token': deleteToken },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erreur HTTP ${res.status}`);
  return body;
}
