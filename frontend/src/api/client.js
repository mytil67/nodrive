/**
 * Couche d'accès à l'API NoDrive.
 *
 * Upload : découpage en chunks de 3.5 Mo envoyés séquentiellement
 * via /api/upload/chunk. Supporte le multi-fichier.
 */

const CHUNK_SIZE = 3.5 * 1024 * 1024;

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
 * Upload un ou plusieurs fichiers chiffrés.
 *
 * @param {string} code
 * @param {{ encrypted: Uint8Array, name: string, size: number }[]} encryptedFiles
 * @param {string} salt
 * @param {string} verifier - preuve de mot de passe (hex), stockée dans les métadonnées
 * @param {(pct: number) => void} onProgress
 * @returns {Promise<string|null>} deleteToken
 */
export async function uploadEncryptedFiles(code, encryptedFiles, salt, verifier, onProgress) {
  const fileTotal = encryptedFiles.length;

  // Calculer le nombre total de chunks pour la progression
  let totalChunks = 0;
  const fileChunkCounts = encryptedFiles.map(f => {
    const count = Math.max(1, Math.ceil(f.encrypted.byteLength / CHUNK_SIZE));
    totalChunks += count;
    return count;
  });

  let chunksUploaded = 0;
  let deleteToken = null;

  for (let fi = 0; fi < fileTotal; fi++) {
    const { encrypted, name, size } = encryptedFiles[fi];
    const chunkTotal = fileChunkCounts[fi];

    for (let ci = 0; ci < chunkTotal; ci++) {
      const start = ci * CHUNK_SIZE;
      const end   = Math.min(start + CHUNK_SIZE, encrypted.byteLength);
      const chunk = encrypted.slice(start, end);

      const isLastOverall = (fi === fileTotal - 1) && (ci === chunkTotal - 1);

      const result = await sendChunk(code, chunk, ci, chunkTotal, fi, fileTotal, salt, verifier,
        isLastOverall ? encryptedFiles.map(f => ({ name: f.name, size: f.size })) : null
      );

      chunksUploaded++;
      const pct = isLastOverall ? 100 : Math.min(Math.round((chunksUploaded / totalChunks) * 100), 99);
      onProgress(pct);

      if (isLastOverall && result.deleteToken) {
        deleteToken = result.deleteToken;
      }
    }
  }

  return deleteToken;
}

/**
 * Encode les métadonnées de fichiers pour un header HTTP.
 * Les valeurs de header doivent être des ByteString (Latin-1) : un nom de
 * fichier contenant un caractère hors Latin-1 (emoji, €, CJK…) ferait lever
 * setRequestHeader. On encode donc le JSON en base64 sur ses octets UTF-8.
 */
function encodeFilesHeader(fileMetas) {
  const bytes = new TextEncoder().encode(JSON.stringify(fileMetas));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Envoie un chunk individuel via XHR.
 */
function sendChunk(code, chunkData, chunkIndex, chunkTotal, fileIndex, fileTotal, salt, verifier, fileMetas) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/chunk');
    xhr.timeout = 60_000;

    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('x-blob-code', code);
    xhr.setRequestHeader('x-chunk-index', String(chunkIndex));
    xhr.setRequestHeader('x-chunk-total', String(chunkTotal));
    xhr.setRequestHeader('x-file-index', String(fileIndex));
    xhr.setRequestHeader('x-file-total', String(fileTotal));

    // Le serveur a besoin de ces headers uniquement sur le dernier chunk du dernier fichier
    if (fileMetas) {
      xhr.setRequestHeader('x-blob-salt', salt);
      xhr.setRequestHeader('x-blob-verifier', verifier);
      xhr.setRequestHeader('x-blob-files', encodeFilesHeader(fileMetas));
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { resolve({}); }
      } else {
        let msg = `Erreur HTTP ${xhr.status} (fichier ${fileIndex}, chunk ${chunkIndex})`;
        try { const b = JSON.parse(xhr.responseText); if (b.error) msg = b.error; } catch {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error',   () => reject(new Error(`Erreur réseau (fichier ${fileIndex}, chunk ${chunkIndex})`)));
    xhr.addEventListener('timeout', () => reject(new Error(`Délai dépassé (fichier ${fileIndex}, chunk ${chunkIndex})`)));

    xhr.send(chunkData);
  });
}

/**
 * Récupère les infos d'un transfert.
 * Sans `verifier` : sous-ensemble non sensible (sel, expiration, nombre de
 * fichiers, taille totale) — les noms de fichiers sont masqués.
 * Avec un `verifier` valide : inclut les noms de fichiers (et renvoie 403 si le
 * mot de passe est incorrect).
 */
export async function getFileInfo(code, verifier) {
  const opts = verifier ? { headers: { 'x-blob-verifier': verifier } } : undefined;
  const res  = await fetch(`/api/file/${encodeURIComponent(code)}/info`, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Erreur HTTP ${res.status}`);
    err.status = res.status; // permet un mapping fiable côté UI, indépendant de la langue
    throw err;
  }
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
