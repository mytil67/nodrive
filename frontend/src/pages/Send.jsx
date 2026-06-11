import { useState, useRef, useEffect } from 'react';
import BackButton from '../components/BackButton.jsx';
import DropZone from '../components/DropZone.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import CodeDisplay from '../components/CodeDisplay.jsx';
import { uploadEncryptedFiles, checkServerHealth } from '../api/client.js';
import { generateTransferCode, generateSalt, deriveKeyAndVerifier, encryptFile } from '../utils/crypto.js';
import { formatSize } from '../utils/format.js';
import { useI18n } from '../i18n/I18nContext.jsx';

const MAX_FILE_SIZE_MB    = parseInt(import.meta.env.VITE_MAX_FILE_SIZE_MB || '25', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TEXT_BYTES      = 100 * 1024; // 100 Ko — largement assez pour des snippets

export default function Send() {
  const { t } = useI18n();
  const [mode,       setMode]       = useState('files'); // 'files' | 'text'
  const [files,      setFiles]      = useState([]);
  const [text,       setText]       = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [progress,   setProgress]   = useState(0);
  const [status,     setStatus]     = useState('idle');
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');
  const [subLabel,   setSubLabel]   = useState('');
  const [showPass,   setShowPass]   = useState(true);

  // Mode texte → thème orange sur toute l'interface (variables CSS)
  useEffect(() => {
    if (mode === 'text') document.documentElement.setAttribute('data-mode', 'text');
    else document.documentElement.removeAttribute('data-mode');
    return () => document.documentElement.removeAttribute('data-mode');
  }, [mode]);

  // Avertir avant de quitter : le code/mot de passe affichés sont irrécupérables
  useEffect(() => {
    if (status !== 'done' && status !== 'uploading' && status !== 'encrypting') return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  const totalSize    = files.reduce((s, f) => s + f.size, 0);
  const fileTooLarge = totalSize > MAX_FILE_SIZE_BYTES;
  const textBytes    = mode === 'text' ? new TextEncoder().encode(text).length : 0;
  const textTooLarge = textBytes > MAX_TEXT_BYTES;
  const canSend      = passphrase.trim().length >= 6 && (
    mode === 'text'
      ? text.trim().length > 0 && !textTooLarge
      : files.length > 0 && !fileTooLarge
  );

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
      const { key, verifier } = await deriveKeyAndVerifier(passphrase.trim(), salt, 'encrypt');

      // Chiffrer le contenu : fichiers sélectionnés, ou texte collé (pastebin)
      const encryptedFiles = [];
      if (mode === 'text') {
        const bytes     = new TextEncoder().encode(text);
        const encrypted = await encryptFile(bytes.buffer, key);
        encryptedFiles.push({
          encrypted,
          name: 'snippet.txt',
          size: bytes.length,
          kind: 'text',
        });
      } else {
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
      }

      setStatus('uploading');
      setProgress(0);
      setSubLabel('');

      const deleteToken = await uploadEncryptedFiles(
        code, encryptedFiles, salt, verifier, setProgress
      );

      setResult({
        code,
        passphrase: passphrase.trim(),
        deleteToken,
        fileCount: encryptedFiles.length,
        kind: mode === 'text' ? 'text' : 'files',
      });
      setStatus('done');

    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  function reset() {
    setFiles([]);
    setText('');
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

          <div className="mode-toggle" role="group" aria-label={t('send.mode.aria')}>
            <button
              type="button"
              className="mode-toggle__btn"
              aria-pressed={mode === 'files'}
              onClick={() => setMode('files')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              {t('send.mode.files')}
            </button>
            <button
              type="button"
              className="mode-toggle__btn"
              aria-pressed={mode === 'text'}
              onClick={() => setMode('text')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="4 17 10 11 4 5"/>
                <line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              {t('send.mode.text')}
            </button>
          </div>

          <div className="send-form">
            <div className="send-step">
              <div className="send-step__label">
                <span className="send-step__num">1</span>
                <span>{mode === 'text' ? t('send.step1.text') : t('send.step1')}</span>
              </div>
              {mode === 'text' ? (
                <>
                  <textarea
                    className="send-textarea"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t('send.text.placeholder')}
                    aria-label={t('send.step1.text')}
                    spellCheck={false}
                  />
                  {textTooLarge && (
                    <p className="send-step__error">
                      {t('send.error.texttoolarge', { size: Math.ceil(textBytes / 1024), max: Math.floor(MAX_TEXT_BYTES / 1024) })}
                    </p>
                  )}
                  {text.length > 0 && !textTooLarge && (
                    <p className="send-step__meta">
                      {t('send.text.count', { count: text.length })}
                    </p>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div className="send-form__divider" aria-hidden="true" />

            <div className="send-step">
              <div className="send-step__label">
                <span className="send-step__num">2</span>
                <span>{t('send.step2')}</span>
              </div>
              <div className="passphrase-row">
                <input
                  id="passphrase-input"
                  type={showPass ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSend && handleSend()}
                  placeholder={t('send.placeholder')}
                  className="send-passphrase-input"
                  autoComplete="off"
                  aria-label={t('send.passphrase.aria')}
                />
                <button
                  type="button"
                  className="passphrase-toggle"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? t('common.hidepass') : t('common.showpass')}
                  aria-pressed={showPass}
                >
                  {showPass ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              <p className="send-step__hint">
                {passphrase.length > 0 && passphrase.length < 6
                  ? <span className="send-step__count">{t('send.hint.count', { count: passphrase.length })}</span>
                  : null
                }
                {passphrase.length >= 6
                  ? <span className="send-step__count send-step__count--ok">&#x2713;</span>
                  : null
                }
                {' '}{t('send.hint')}
              </p>
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
          <CodeDisplay code={result.code} passphrase={result.passphrase} deleteToken={result.deleteToken} fileCount={result.fileCount} kind={result.kind} />
          <button className="btn btn--secondary send-again" onClick={reset}>
            {result.kind === 'text' ? t('send.again.text') : t('send.again')}
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
