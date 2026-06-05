import { useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import DropZone from '../components/DropZone.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import CodeDisplay from '../components/CodeDisplay.jsx';
import { uploadEncryptedFile, checkServerHealth } from '../api/client.js';
import { generateTransferCode, generateSalt, deriveKeyFromPassphrase, encryptFile } from '../utils/crypto.js';
import { formatSize } from '../utils/format.js';
import { useI18n } from '../i18n/I18nContext.jsx';

const MAX_FILE_SIZE_MB    = parseInt(import.meta.env.VITE_MAX_FILE_SIZE_MB || '25', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export default function Send() {
  const { t } = useI18n();
  const [file,       setFile]       = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [progress,   setProgress]   = useState(0);
  const [status,     setStatus]     = useState('idle');
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');

  async function handleSend() {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t('send.error.toolarge', { size: formatSize(file.size), max: MAX_FILE_SIZE_MB }));
      setStatus('error');
      return;
    }
    if (passphrase.trim().length < 6) {
      setError(t('send.error.password'));
      setStatus('error');
      return;
    }

    try {
      setStatus('encrypting');
      const health = await checkServerHealth();
      if (health !== null && !health.hasBlobToken) {
        throw new Error(t('send.error.storage'));
      }

      const code = generateTransferCode();
      const salt = generateSalt();
      const key  = await deriveKeyFromPassphrase(passphrase.trim(), salt, 'encrypt');

      const fileBuffer    = await file.arrayBuffer();
      const encryptedData = await encryptFile(fileBuffer, key);

      setStatus('uploading');
      setProgress(0);
      const deleteToken = await uploadEncryptedFile(
        code,
        encryptedData,
        { originalName: file.name, size: file.size, salt },
        setProgress
      );

      setResult({ code, passphrase: passphrase.trim(), deleteToken });
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
  const canSend = file && !fileTooLarge && passphrase.trim().length >= 6;

  /* -- Idle -- */
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
        <h1>{t('send.title')}</h1>
      </header>

      <div className="send-form">

        {/* -- Step 1 -- */}
        <div className="send-step">
          <div className="send-step__label">
            <span className="send-step__num">1</span>
            <span>{t('send.step1')}</span>
          </div>
          <DropZone file={file} onFile={setFile} />
          {fileTooLarge && (
            <p className="send-step__error">
              {t('send.error.toolarge', { size: formatSize(file.size), max: MAX_FILE_SIZE_MB })}
            </p>
          )}
          {file && !fileTooLarge && (
            <p className="send-step__meta">
              <strong>{file.name}</strong> · {formatSize(file.size)}
            </p>
          )}
        </div>

        <div className="send-form__divider" aria-hidden="true" />

        {/* -- Step 2 -- */}
        <div className="send-step">
          <div className="send-step__label">
            <span className="send-step__num">2</span>
            <span>{t('send.step2')}</span>
          </div>
          <input
            id="passphrase-input"
            type="text"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSend && handleSend()}
            placeholder={t('send.placeholder')}
            className="send-passphrase-input"
            autoComplete="off"
            aria-label={t('send.passphrase.aria')}
          />
          <p className="send-step__hint">{t('send.hint')}</p>
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
        {t('send.cta')}
      </button>
    </main>
  );

  /* -- Encrypting -- */
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
        <p className="send-progress-card__title">{t('send.encrypting')}</p>
        <p className="send-progress-card__sub">{t('send.encrypting.sub')}</p>
        <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label={t('send.encrypting.aria')}>
          <div className="progress-bar__fill progress-bar__fill--indeterminate" />
        </div>
      </div>
    </main>
  );

  /* -- Uploading -- */
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
        <p className="send-progress-card__title">{t('send.uploading')}</p>
        <p className="send-progress-card__sub">
          {progress > 0 ? `${progress} %` : t('send.connecting')}
        </p>
        {progress > 0
          ? <ProgressBar value={progress} />
          : <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label={t('send.uploading.aria')}>
              <div className="progress-bar__fill progress-bar__fill--indeterminate" />
            </div>
        }
      </div>
    </main>
  );

  /* -- Done -- */
  if (status === 'done' && result) return (
    <main className="send-page">
      <BackButton />
      <CodeDisplay code={result.code} passphrase={result.passphrase} deleteToken={result.deleteToken} />
      <button className="btn btn--secondary send-again" onClick={reset}>
        {t('send.again')}
      </button>
    </main>
  );

  /* -- Error -- */
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
        <p className="send-progress-card__title">{t('send.error')}</p>
        <p className="send-progress-card__sub send-progress-card__sub--error">{error}</p>
        <button className="btn btn--secondary" onClick={reset}>{t('send.retry')}</button>
      </div>
    </main>
  );
}
