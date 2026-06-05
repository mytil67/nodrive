import { useState } from 'react';
import BackButton from '../components/BackButton.jsx';
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
 * États : idle → encrypting → uploading → done | error
 */
export default function Send() {
  const [file,       setFile]       = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [progress,   setProgress]   = useState(0);
  const [status,     setStatus]     = useState('idle');
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');

  async function handleSend() {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`Fichier trop volumineux (${formatSize(file.size)} — max ${MAX_FILE_SIZE_MB} Mo)`);
      setStatus('error');
      return;
    }
    if (!passphrase.trim()) {
      setError('Veuillez saisir un mot de passe.');
      setStatus('error');
      return;
    }

    try {
      setStatus('encrypting');
      const health = await checkServerHealth();
      if (health !== null && !health.hasBlobToken) {
        throw new Error('Service de stockage non configuré sur le serveur.');
      }

      const code = generateTransferCode();
      const key  = await deriveKeyFromPassphrase(passphrase.trim(), code, 'encrypt');

      const fileBuffer    = await file.arrayBuffer();
      const encryptedData = await encryptFile(fileBuffer, key);

      setStatus('uploading');
      setProgress(0);
      await uploadEncryptedFile(
        code,
        encryptedData,
        { originalName: file.name, size: file.size },
        setProgress
      );

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
  const canSend = file && !fileTooLarge && passphrase.trim();

  /* ── Idle ── */
  if (status === 'idle') return (
    <main className="send-page">
      <BackButton />

      <header className="send-header">
        <span className="send-header__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
        </span>
        <h1>Envoyer un fichier</h1>
      </header>

      <div className="send-form">

        {/* ── Étape 1 : fichier ── */}
        <div className="send-step">
          <div className="send-step__label">
            <span className="send-step__num">1</span>
            <span>Sélectionner un fichier</span>
          </div>
          <DropZone file={file} onFile={setFile} />
          {fileTooLarge && (
            <p className="send-step__error">
              Fichier trop volumineux ({formatSize(file.size)} — max {MAX_FILE_SIZE_MB} Mo)
            </p>
          )}
          {file && !fileTooLarge && (
            <p className="send-step__meta">
              <strong>{file.name}</strong> · {formatSize(file.size)}
            </p>
          )}
        </div>

        <div className="send-form__divider" aria-hidden="true" />

        {/* ── Étape 2 : mot de passe ── */}
        <div className="send-step">
          <div className="send-step__label">
            <span className="send-step__num">2</span>
            <span>Choisir un mot de passe</span>
          </div>
          <input
            id="passphrase-input"
            type="text"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSend && handleSend()}
            placeholder="Ex : soleil-bleu-42"
            className="send-passphrase-input"
            autoComplete="off"
            aria-label="Mot de passe de chiffrement"
          />
          <p className="send-step__hint">
            Le destinataire devra le saisir pour déchiffrer le fichier.
          </p>
        </div>

      </div>

      <button
        className="btn btn--send-cta"
        onClick={handleSend}
        disabled={!canSend}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
        Chiffrer et envoyer
      </button>
    </main>
  );

  /* ── Encrypting ── */
  if (status === 'encrypting') return (
    <main className="send-page">
      <BackButton />
      <div className="send-progress-card">
        <div className="send-progress-card__icon send-progress-card__icon--blue" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <p className="send-progress-card__title">Chiffrement en cours…</p>
        <p className="send-progress-card__sub">Le fichier est chiffré localement dans votre navigateur</p>
        <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label="Chiffrement">
          <div className="progress-bar__fill progress-bar__fill--indeterminate" />
        </div>
      </div>
    </main>
  );

  /* ── Uploading ── */
  if (status === 'uploading') return (
    <main className="send-page">
      <BackButton />
      <div className="send-progress-card">
        <div className="send-progress-card__icon send-progress-card__icon--blue" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
            <path d="M19 21H5"/>
          </svg>
        </div>
        <p className="send-progress-card__title">Envoi en cours…</p>
        <p className="send-progress-card__sub">
          {progress > 0 ? `${progress} %` : 'Connexion au serveur…'}
        </p>
        {progress > 0
          ? <ProgressBar value={progress} />
          : <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label="Envoi">
              <div className="progress-bar__fill progress-bar__fill--indeterminate" />
            </div>
        }
      </div>
    </main>
  );

  /* ── Done ── */
  if (status === 'done' && result) return (
    <main className="send-page">
      <BackButton />
      <CodeDisplay code={result.code} passphrase={result.passphrase} />
      <button className="btn btn--secondary send-again" onClick={reset}>
        Envoyer un autre fichier
      </button>
    </main>
  );

  /* ── Error ── */
  return (
    <main className="send-page">
      <BackButton />
      <div className="send-progress-card send-progress-card--error">
        <div className="send-progress-card__icon send-progress-card__icon--red" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p className="send-progress-card__title">Une erreur est survenue</p>
        <p className="send-progress-card__sub send-progress-card__sub--error">{error}</p>
        <button className="btn btn--secondary" onClick={reset}>Réessayer</button>
      </div>
    </main>
  );
}
