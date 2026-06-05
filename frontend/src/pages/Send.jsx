import { useState } from 'react';
import { Link } from 'react-router-dom';
import DropZone from '../components/DropZone.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import CodeDisplay from '../components/CodeDisplay.jsx';
import { uploadEncryptedFile, checkServerHealth } from '../api/client.js';
import { generateTransferCode, deriveKeyFromPassphrase, encryptFile } from '../utils/crypto.js';
import { formatSize } from '../utils/format.js';

const MAX_FILE_SIZE_MB    = parseInt(import.meta.env.VITE_MAX_FILE_SIZE_MB || '25', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Page d'envoi d'un fichier.
 *
 * États : idle → encrypting → uploading → done | error
 *
 * Flux de sécurité :
 *  1. Génération du code + de la clé AES-GCM dans le navigateur
 *  2. Chiffrement du fichier localement (Web Crypto API)
 *  3. Upload direct navigateur → Vercel Blob (la Function ne voit pas le fichier)
 *  4. Affichage du lien /receive/:code#keyB64url
 *     Le fragment # n'est jamais envoyé au serveur
 */
export default function Send() {
  const [file,       setFile]       = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [progress,   setProgress]   = useState(0);
  const [status,     setStatus]     = useState('idle'); // idle|encrypting|uploading|done|error
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');

  async function handleSend() {
    if (!file) return;

    // Validation taille côté client (avant tout traitement)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`Fichier trop volumineux (${formatSize(file.size)} / max ${MAX_FILE_SIZE_MB} Mo)`);
      setStatus('error');
      return;
    }

    if (!passphrase.trim()) {
      setError('Veuillez saisir un mot de passe pour protéger le fichier.');
      setStatus('error');
      return;
    }

    try {
      // ── Étape 0 : vérification serveur (évite de chiffrer pour rien) ────
      setStatus('encrypting');
      const health = await checkServerHealth();
      // Si la réponse est explicite sur l'absence du token, on arrête immédiatement
      if (health !== null && !health.hasBlobToken) {
        throw new Error(
          'Le service de stockage n\'est pas configuré sur le serveur. ' +
          'Vérifiez que le Vercel Blob Store est connecté au projet dans le Dashboard Vercel.'
        );
      }

      // ── Étape 1 : génération du code et dérivation de la clé ───────────
      const code = generateTransferCode();
      const key  = await deriveKeyFromPassphrase(passphrase.trim(), code, 'encrypt');

      // ── Étape 2 : chiffrement local du fichier ──────────────────────────
      const fileBuffer    = await file.arrayBuffer();
      const encryptedData = await encryptFile(fileBuffer, key);

      // ── Étape 3 : upload direct vers Vercel Blob ────────────────────────
      setStatus('uploading');
      setProgress(0);
      await uploadEncryptedFile(
        code,
        encryptedData,
        { originalName: file.name, size: file.size },
        setProgress
      );

      // ── Étape 4 : affichage du résultat ────────────────────────────────
      setResult({ code, passphrase: passphrase.trim() });
      setStatus('done');

    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  function reset() {
    setFile(null);
    setPassphrase('');
    setProgress(0);
    setStatus('idle');
    setResult(null);
    setError('');
  }

  const fileTooLarge = file && file.size > MAX_FILE_SIZE_BYTES;

  return (
    <main className="page">
      <Link to="/" className="back-link">← Retour</Link>
      <h1>Envoyer un fichier</h1>

      {/* ── Sélection du fichier ── */}
      {status === 'idle' && (
        <section>
          <DropZone file={file} onFile={setFile} />

          <div className="passphrase-field">
            <label htmlFor="passphrase-input">Mot de passe de chiffrement</label>
            <input
              id="passphrase-input"
              type="text"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Ex : cheval-violet-42"
              className="code-input"
              autoComplete="off"
            />
            <p className="passphrase-hint">
              Le destinataire devra saisir ce mot de passe pour déchiffrer le fichier.
            </p>
          </div>

          {file && (
            <div className="file-info">
              {fileTooLarge ? (
                <p className="error-text">
                  Fichier trop volumineux ({formatSize(file.size)} / max {MAX_FILE_SIZE_MB} Mo)
                </p>
              ) : (
                <p><strong>{file.name}</strong>&nbsp;—&nbsp;{formatSize(file.size)}</p>
              )}
              <button
                className="btn btn--primary"
                onClick={handleSend}
                disabled={fileTooLarge || !passphrase.trim()}
              >
                Chiffrer et envoyer
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Chiffrement local (indéterminé) ── */}
      {status === 'encrypting' && (
        <section className="upload-progress">
          <p>Chiffrement en cours…</p>
          <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label="Chiffrement en cours">
            <div className="progress-bar__fill progress-bar__fill--indeterminate" />
          </div>
          <p className="progress-label">Le fichier est chiffré localement avant envoi</p>
        </section>
      )}

      {/* ── Upload vers Vercel Blob ── */}
      {status === 'uploading' && (
        <section className="upload-progress">
          <p>Envoi du fichier chiffré…</p>
          {progress === 0 ? (
            <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label="Envoi en cours">
              <div className="progress-bar__fill progress-bar__fill--indeterminate" />
            </div>
          ) : (
            <ProgressBar value={progress} />
          )}
          <p className="progress-pct">{progress > 0 ? `${progress} %` : 'Connexion au CDN…'}</p>
        </section>
      )}

      {/* ── Succès : affichage du code et du lien ── */}
      {status === 'done' && result && (
        <section>
          <CodeDisplay code={result.code} passphrase={result.passphrase} />
          <button className="btn btn--secondary" onClick={reset}>
            Envoyer un autre fichier
          </button>
        </section>
      )}

      {/* ── Erreur ── */}
      {status === 'error' && (
        <section className="error-box">
          <p className="error-text">Erreur : {error}</p>
          <button className="btn btn--secondary" onClick={reset}>Réessayer</button>
        </section>
      )}
    </main>
  );
}
