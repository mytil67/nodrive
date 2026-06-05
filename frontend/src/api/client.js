/**
 * Couche d'accès à l'API NoDrive.
 *
 * Upload : XHR natif navigateur → /api/upload (proxy serveur → Vercel Blob).
 *          @vercel/blob/client est volontairement absent côté frontend :
 *          en v2.x il envoie le PUT vers vercel.com/api/blob (API management,
 *          sans CORS) au lieu du CDN blob.vercel-storage.com.
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
 * Upload un fichier chiffré vers /api/upload via XHR.
 *
 * Le corps de la requête est le binaire brut (Uint8Array).
 * Les métadonnées sont transmises dans des en-têtes personnalisés.
 * La progression est fournie par XHR.upload.onprogress — pas de streaming
 * ReadableStream, pas de CORS, pas de dépendance @vercel/blob/client.
 *
 * @param {string}     code          - code de transfert (6 chars)
 * @param {Uint8Array} encryptedData - données chiffrées (IV + ciphertext)
 * @param {{ originalName: string, size: number }} fileMeta
 * @param {(pct: number) => void} onProgress
 */
export function uploadEncryptedFile(code, encryptedData, fileMeta, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.timeout = 120_000; // 2 min

    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('x-blob-code', code);
    xhr.setRequestHeader('x-blob-name', encodeURIComponent(fileMeta.originalName));
    xhr.setRequestHeader('x-blob-size', String(fileMeta.size));

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(Math.min(pct, 99)); // 99% max — 100% à la réponse serveur
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let msg = `Erreur HTTP ${xhr.status}`;
        try { const b = JSON.parse(xhr.responseText); if (b.error) msg = b.error; } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error',   () => reject(new Error('Erreur réseau lors de l\'upload')));
    xhr.addEventListener('abort',   () => reject(new Error('Upload annulé')));
    xhr.addEventListener('timeout', () => reject(new Error('Upload interrompu : délai de 2 min dépassé')));

    console.log('[upload] Envoi — code:', code, 'taille:', encryptedData.byteLength, 'bytes');
    xhr.send(encryptedData);
  });
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
