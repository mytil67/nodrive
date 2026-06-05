/**
 * Couche d'accès à l'API NoDrive.
 *
 * Upload : deux modes selon la taille du fichier chiffré :
 *  - <= 3.5 Mo : XHR direct vers /api/upload (proxy serveur, simple)
 *  - > 3.5 Mo  : découpage en chunks de 3.5 Mo envoyés séquentiellement
 *                via /api/upload/chunk
 */

const CHUNK_SIZE = 3.5 * 1024 * 1024; // 3.5 Mo — sous la limite body Vercel Serverless (4.5 Mo)

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
  if (encryptedData.byteLength <= CHUNK_SIZE) {
    return uploadViaProxy(code, encryptedData, fileMeta, onProgress);
  }
  return uploadViaChunks(code, encryptedData, fileMeta, onProgress);
}

/**
 * Upload direct via XHR → /api/upload (fichiers <= 3.5 Mo).
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
 * Upload par chunks vers /api/upload/chunk (fichiers > 3.5 Mo).
 * Découpe le fichier chiffré en morceaux de 3.5 Mo et les envoie
 * séquentiellement via XHR. Chaque chunk passe sous la limite body Vercel.
 */
async function uploadViaChunks(code, encryptedData, fileMeta, onProgress) {
  const totalBytes = encryptedData.byteLength;
  const chunkTotal = Math.ceil(totalBytes / CHUNK_SIZE);

  for (let i = 0; i < chunkTotal; i++) {
    const start = i * CHUNK_SIZE;
    const end   = Math.min(start + CHUNK_SIZE, totalBytes);
    const chunk = encryptedData.slice(start, end);
    const isLast = (i === chunkTotal - 1);

    const result = await sendChunk(code, chunk, i, chunkTotal, fileMeta, isLast);

    // Progression : répartir uniformément entre 0 et 99, puis 100 au dernier
    const pct = isLast ? 100 : Math.min(Math.round(((i + 1) / chunkTotal) * 100), 99);
    onProgress(pct);

    if (isLast) {
      return result.deleteToken || null;
    }
  }

  return null;
}

/**
 * Envoie un chunk individuel via XHR.
 */
function sendChunk(code, chunkData, index, total, fileMeta, isLast) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/chunk');
    xhr.timeout = 60_000;

    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('x-blob-code', code);
    xhr.setRequestHeader('x-chunk-index', String(index));
    xhr.setRequestHeader('x-chunk-total', String(total));

    // Le serveur n'a besoin de ces headers que sur le dernier chunk
    if (isLast) {
      xhr.setRequestHeader('x-blob-name', encodeURIComponent(fileMeta.originalName));
      xhr.setRequestHeader('x-blob-size', String(fileMeta.size));
      xhr.setRequestHeader('x-blob-salt', fileMeta.salt);
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch { resolve({}); }
      } else {
        let msg = `Erreur HTTP ${xhr.status} (chunk ${index})`;
        try { const b = JSON.parse(xhr.responseText); if (b.error) msg = b.error; } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error',   () => reject(new Error(`Erreur réseau (chunk ${index})`)));
    xhr.addEventListener('timeout', () => reject(new Error(`Délai dépassé (chunk ${index})`)));

    xhr.send(chunkData);
  });
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
