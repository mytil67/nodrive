import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ProgressBar from '../components/ProgressBar.jsx';
import { getFileInfo, deleteTransfer } from '../api/client.js';
import { importEncryptionKey, decryptFile } from '../utils/crypto.js';
import { formatSize } from '../utils/format.js';

/**
 * Page de réception d'un fichier chiffré.
 *
 * Lecture de l'URL : /receive/:code#keyB64url
 *  - code       → paramètre de route
 *  - keyB64url  → fragment (#), jamais envoyé au serveur
 *
 * États : idle → loading → ready → downloading → decrypting → done | error
 *
 * Flux de sécurité :
 *  1. Lecture du code (URL) et de la clé (fragment #)
 *  2. GET /api/file/:code/info pour récupérer les infos + blobUrl
 *  3. fetch(blobUrl) pour télécharger le fichier chiffré
 *  4. Déchiffrement AES-GCM dans le navigateur avec la clé du fragment
 *  5. Téléchargement du fichier déchiffré via un lien temporaire
 *  6. Suppression du transfert si usage unique (maxDownloads === 1)
 */
export default function Receive() {
  const { code: urlCode } = useParams();

  const [inputCode,    setInputCode]    = useState(urlCode || '');
  const [keyFragment,  setKeyFragment]  = useState('');
  const [fileInfo,     setFileInfo]     = useState(null);
  const [status,       setStatus]       = useState('idle');
  const [progress,     setProgress]     = useState(0);
  const [error,        setError]        = useState('');

  // Lecture initiale du fragment # et auto-lookup si code dans l'URL
  useEffect(() => {
    const hash = window.location.hash.slice(1); // retirer le '#'
    if (hash) setKeyFragment(hash);
    if (urlCode) lookupCode(urlCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode]);

  /**
   * Interroge l'API pour récupérer les infos du fichier.
   * N'utilise pas la clé : elle n'est nécessaire qu'au déchiffrement.
   */
  async function lookupCode(code = inputCode) {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setStatus('loading');
    setError('');
    try {
      const info = await getFileInfo(normalized);
      setFileInfo(info);
      setInputCode(normalized);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  /**
   * Télécharge le blob chiffré, le déchiffre localement, déclenche le download.
   */
  async function handleDownload() {
    const code = inputCode.trim().toUpperCase();
    const key  = keyFragment || window.location.hash.slice(1);

    if (!key) {
      setError(
        "Clé de déchiffrement absente. " +
        "Utilisez le lien complet partagé par l'expéditeur (l'URL doit contenir un #)."
      );
      setStatus('error');
      return;
    }

    try {
      // ── Étape 1 : téléchargement du fichier chiffré ─────────────────────
      setStatus('downloading');
      setProgress(0);

      const response = await fetch(fileInfo.blobUrl);
      if (!response.ok) throw new Error('Téléchargement du fichier chiffré échoué');

      // Lecture du body par chunks pour afficher la progression
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (contentLength > 0) {
          setProgress(Math.round((loaded / contentLength) * 100));
        }
      }

      // Assembler tous les chunks en un seul Uint8Array
      const encryptedData = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        encryptedData.set(chunk, offset);
        offset += chunk.length;
      }

      // ── Étape 2 : déchiffrement local ───────────────────────────────────
      setStatus('decrypting');
      const cryptoKey       = await importEncryptionKey(key);
      const decryptedBuffer = await decryptFile(encryptedData, cryptoKey);

      // ── Étape 3 : déclenchement du téléchargement navigateur ────────────
      const blob = new Blob([decryptedBuffer]);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = fileInfo.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // ── Étape 4 : suppression si usage unique ───────────────────────────
      if (fileInfo.maxDownloads === 1) {
        deleteTransfer(code); // fire-and-forget
      }

      setStatus('done');

    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  function reset() {
    setInputCode('');
    setKeyFragment('');
    setFileInfo(null);
    setStatus('idle');
    setProgress(0);
    setError('');
  }

  const showInput = status === 'idle' || status === 'loading' || status === 'error';
  const hasKey    = Boolean(keyFragment || window.location.hash.slice(1));

  return (
    <main className="page">
      <Link to="/" className="back-link">← Retour</Link>
      <h1>Recevoir un fichier</h1>

      {/* ── Saisie du code ── */}
      {showInput && (
        <section className="code-input-area">
          <label htmlFor="code-input" className="code-input-label">
            Code de transfert
          </label>
          <div className="code-input-row">
            <input
              id="code-input"
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="Ex : AB3K7P"
              onKeyDown={(e) => e.key === 'Enter' && lookupCode()}
              className="code-input"
              autoFocus
            />
            <button
              className="btn btn--primary"
              onClick={() => lookupCode()}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Recherche…' : 'Vérifier'}
            </button>
          </div>

          {/* Avertissement si clé absente mais code présent */}
          {!hasKey && inputCode.length === 6 && status !== 'error' && (
            <p className="warning-text">
              ⚠ Aucune clé dans l'URL. Assurez-vous d'utiliser le lien complet (avec #…).
            </p>
          )}

          {status === 'error' && <p className="error-text">{error}</p>}
        </section>
      )}

      {/* ── Fichier prêt à télécharger ── */}
      {status === 'ready' && fileInfo && (
        <section className="file-ready">
          <div className="file-preview">
            <p className="file-name">{fileInfo.originalName}</p>
            <p className="file-meta">
              {formatSize(fileInfo.size)}&nbsp;·&nbsp;expire à&nbsp;
              {new Date(fileInfo.expiresAt).toLocaleTimeString('fr-FR', {
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {!hasKey && (
              <p className="error-text" style={{ marginTop: '0.5rem' }}>
                ⚠ Clé de déchiffrement absente — utilisez le lien complet
              </p>
            )}
          </div>
          <button
            className="btn btn--primary"
            onClick={handleDownload}
            disabled={!hasKey}
          >
            Télécharger et déchiffrer
          </button>
        </section>
      )}

      {/* ── Téléchargement du blob ── */}
      {status === 'downloading' && (
        <section className="upload-progress">
          <p>Téléchargement du fichier chiffré…</p>
          <ProgressBar value={progress} />
          {progress > 0 && <p className="progress-pct">{progress} %</p>}
        </section>
      )}

      {/* ── Déchiffrement local (indéterminé) ── */}
      {status === 'decrypting' && (
        <section className="upload-progress">
          <p>Déchiffrement en cours…</p>
          <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label="Déchiffrement en cours">
            <div className="progress-bar__fill progress-bar__fill--indeterminate" />
          </div>
        </section>
      )}

      {/* ── Succès ── */}
      {status === 'done' && (
        <section className="success-box">
          <p>Fichier téléchargé et déchiffré avec succès !</p>
          <button className="btn btn--secondary" onClick={reset}>
            Recevoir un autre fichier
          </button>
        </section>
      )}
    </main>
  );
}
