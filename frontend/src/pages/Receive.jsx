import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { getFileInfo } from '../api/client.js';
import { deriveKeyFromPassphrase, decryptFile } from '../utils/crypto.js';
import { formatSize } from '../utils/format.js';

/**
 * Page de réception d'un fichier chiffré.
 *
 * Lecture de l'URL : /receive/:code
 *  - code → paramètre de route (optionnel, peut aussi être saisi manuellement)
 *
 * États : idle → loading → ready → downloading → decrypting → done | error
 *
 * Flux de sécurité :
 *  1. Saisie du code (6 chars) et du mot de passe par le destinataire
 *  2. GET /api/file/:code/info pour vérifier que le transfert existe
 *  3. GET /api/file/:code/download pour télécharger le fichier chiffré (proxy serveur)
 *  4. Dérivation de la clé AES-GCM via PBKDF2(mot_de_passe, code)
 *  5. Déchiffrement AES-GCM dans le navigateur
 *  6. Téléchargement du fichier déchiffré via un lien temporaire
 *  7. Suppression du transfert si usage unique (maxDownloads === 1)
 */
export default function Receive() {
  const { code: urlCode } = useParams();

  const [inputCode,    setInputCode]    = useState(urlCode || '');
  const [passphrase,   setPassphrase]   = useState('');
  const [fileInfo,     setFileInfo]     = useState(null);
  const [status,       setStatus]       = useState('idle');
  const [progress,     setProgress]     = useState(0);
  const [error,        setError]        = useState('');

  // Auto-lookup si le code est dans l'URL
  useEffect(() => {
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
    const pass = passphrase.trim();

    if (!pass) {
      setError('Veuillez saisir le mot de passe fourni par l\'expéditeur.');
      setStatus('error');
      return;
    }

    try {
      // ── Étape 1 : téléchargement du fichier chiffré ─────────────────────
      setStatus('downloading');
      setProgress(0);

      const response = await fetch(`/api/file/${encodeURIComponent(code)}/download`);
      if (!response.ok) {
        let msg = 'Téléchargement du fichier chiffré échoué';
        try { const b = await response.json(); if (b.error) msg = b.error; } catch {}
        throw new Error(msg);
      }

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

      // ── Étape 2 : dérivation de la clé + déchiffrement local ────────────
      setStatus('decrypting');
      // Le sel est récupéré depuis les métadonnées (public, 128 bits)
      const cryptoKey       = await deriveKeyFromPassphrase(pass, fileInfo.salt, 'decrypt');
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

      // La suppression est gérée côté serveur dans /download quand le quota est atteint
      setStatus('done');

    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  function reset() {
    setInputCode('');
    setPassphrase('');
    setFileInfo(null);
    setStatus('idle');
    setProgress(0);
    setError('');
  }

  const showInput = status === 'idle' || status === 'loading' || status === 'error';

  return (
    <main className="page">
      <BackButton />
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
          </div>

          <div className="passphrase-field">
            <label htmlFor="passphrase-recv">Mot de passe</label>
            <input
              id="passphrase-recv"
              type="text"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Mot de passe fourni par l'expéditeur"
              className="code-input"
              autoComplete="off"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && passphrase.trim() && handleDownload()}
            />
          </div>

          <button
            className="btn btn--primary"
            onClick={handleDownload}
            disabled={!passphrase.trim()}
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
