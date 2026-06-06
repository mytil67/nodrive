import { useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import DropZone from '../components/DropZone.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import CodeDisplay from '../components/CodeDisplay.jsx';
import { uploadEncryptedFiles, checkServerHealth } from '../api/client.js';
import { generateTransferCode, generateSalt, deriveKeyFromPassphrase, encryptFile } from '../utils/crypto.js';
import { formatSize } from '../utils/format.js';
import { useI18n } from '../i18n/I18nContext.jsx';

const MAX_FILE_SIZE_MB    = parseInt(import.meta.env.VITE_MAX_FILE_SIZE_MB || '25', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export default function Send() {
  const { t } = useI18n();
  const [files,      setFiles]      = useState([]);
  const [passphrase, setPassphrase] = useState('');
  const [progress,   setProgress]   = useState(0);
  const [status,     setStatus]     = useState('idle');
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');
  const [subLabel,   setSubLabel]   = useState('');

  const totalSize    = files.reduce((s, f) => s + f.size, 0);
  const fileTooLarge = totalSize > MAX_FILE_SIZE_BYTES;
  const canSend      = files.length > 0 && !fileTooLarge && passphrase.trim().length >= 6;

  async function handleSend() {
    if (!canSend) return;

    try {
      setStatus('encrypting');
      setSubLabel('');

      const health = await checkServerHealth();
      if (health !== null && !health.hasBlobToken) {
        throw new Error(t('send.error.storage'));
      }

      const code = generateTransferCode();
      const salt = generateSalt();
      const key  = await deriveKeyFromPassphrase(passphrase.trim(), salt, 'encrypt');

      // Chiffrer chaque fichier
      const encryptedFiles = [];
      for (let i = 0; i < files.length; i++) {
        setSubLabel(`${t('send.encrypting.file')} ${i + 1}/${files.length}…`);
        const buffer    = await files[i].arrayBuffer();
        const encrypted = await encryptFile(buffer, key);
        encryptedFiles.push({
          encrypted,
          name: files[i].name,
          size: files[i].size,
        });
      }

      setStatus('uploading');
      setProgress(0);
      setSubLabel('');

      const deleteToken = await uploadEncryptedFiles(
        code, encryptedFiles, salt, setProgress
      );

      setResult({ code, passphrase: passphrase.trim(), deleteToken, fileCount: files.length });
      setStatus('done');

    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  function reset() {
    setFiles([]);
    setPassphrase('');
    setProgress(0);
    setStatus('idle');
    setResult(null);
    setError('');
    setSubLabel('');
  }

  return (
    <main className="send-page">
      <BackButton />

      {/* ── Idle ── */}
      {status === 'idle' && (
        <div className="fade-in">
          <header className="send-header">
            <span className="send-header__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/>
              </svg>
            </span>
            <h1>{t('send.title')}</h1>
          </header>

          <div className="send-form">
            <div className="send-step">
              <div className="send-step__label">
                <span className="send-step__num">1</span>
                <span>{t('send.step1')}</span>
              </div>
              <DropZone files={files} onFiles={setFiles} />
              {fileTooLarge && (
                <p className="send-step__error">
                  {t('send.error.toolarge', { size: formatSize(totalSize), max: MAX_FILE_SIZE_MB })}
                </p>
              )}
              {files.length > 0 && !fileTooLarge && (
                <p className="send-step__meta">
                  {files.length > 1
                    ? `${files.length} ${t('send.files')} · ${formatSize(totalSize)}`
                    : <><strong>{files[0].name}</strong> · {formatSize(files[0].size)}</>
                  }
                </p>
              )}
            </div>

            <div className="send-form__divider" aria-hidden="true" />

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

          <button className="btn btn--send-cta" onClick={handleSend} disabled={!canSend}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
            {t('send.cta')}
          </button>
        </div>
      )}

      {/* ── Encrypting ── */}
      {status === 'encrypting' && (
        <div className="send-progress-card fade-in">
          <div className="send-progress-card__icon send-progress-card__icon--blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <p className="send-progress-card__title">{t('send.encrypting')}</p>
          <p className="send-progress-card__sub">{subLabel || t('send.encrypting.sub')}</p>
          <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label={t('send.encrypting.aria')}>
            <div className="progress-bar__fill progress-bar__fill--indeterminate" />
          </div>
        </div>
      )}

      {/* ── Uploading ── */}
      {status === 'uploading' && (
        <div className="send-progress-card fade-in">
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
      )}

      {/* ── Done ── */}
      {status === 'done' && result && (
        <div className="fade-in">
          <CodeDisplay code={result.code} passphrase={result.passphrase} deleteToken={result.deleteToken} fileCount={result.fileCount} />
          <button className="btn btn--secondary send-again" onClick={reset}>
            {t('send.again')}
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && (
        <div className="send-progress-card send-progress-card--error fade-in">
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
      )}
    </main>
  );
}
