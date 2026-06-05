import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { getFileInfo } from '../api/client.js';
import { deriveKeyFromPassphrase, decryptFile } from '../utils/crypto.js';
import { formatSize } from '../utils/format.js';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function Receive() {
  const { code: urlCode } = useParams();
  const { t, lang } = useI18n();

  const [inputCode,    setInputCode]    = useState(urlCode || '');
  const [passphrase,   setPassphrase]   = useState('');
  const [fileInfo,     setFileInfo]     = useState(null);
  const [status,       setStatus]       = useState('idle');
  const [progress,     setProgress]     = useState(0);
  const [subLabel,     setSubLabel]     = useState('');
  const [error,        setError]        = useState('');

  useEffect(() => {
    if (urlCode) lookupCode(urlCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode]);

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

  async function handleDownload() {
    const code = inputCode.trim().toUpperCase();
    const pass = passphrase.trim();

    if (!pass) {
      setError(t('receive.error.password'));
      setStatus('error');
      return;
    }

    try {
      setStatus('downloading');
      setProgress(0);
      setSubLabel('');

      const files = fileInfo.files;
      const totalFiles = files.length;

      // Calculer le nombre total de chunks pour la progression globale
      let totalChunks = 0;
      for (const f of files) {
        totalChunks += Math.max(1, f.chunkCount);
      }
      let chunksDownloaded = 0;

      const cryptoKey = await deriveKeyFromPassphrase(pass, fileInfo.salt, 'decrypt');

      for (let fi = 0; fi < totalFiles; fi++) {
        const file = files[fi];
        const chunkCount = Math.max(1, file.chunkCount);

        if (totalFiles > 1) {
          setSubLabel(`${t('receive.downloading.file')} ${fi + 1}/${totalFiles} — ${file.originalName}`);
        }

        // Télécharger tous les chunks de ce fichier
        let encryptedData;
        if (file.chunkCount > 0) {
          const parts = [];
          let totalLoaded = 0;

          for (let ci = 0; ci < file.chunkCount; ci++) {
            const response = await fetch(
              `/api/file/${encodeURIComponent(code)}/download?file=${fi}&chunk=${ci}`
            );
            if (!response.ok) {
              let msg = `${t('receive.error.download')} (chunk ${ci}, HTTP ${response.status})`;
              try { const b = await response.json(); if (b.error) msg = b.error; } catch {}
              throw new Error(msg);
            }

            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              parts.push(value);
              totalLoaded += value.length;
            }

            chunksDownloaded++;
            setProgress(Math.round((chunksDownloaded / totalChunks) * 90));
          }

          encryptedData = new Uint8Array(totalLoaded);
          let offset = 0;
          for (const part of parts) {
            encryptedData.set(part, offset);
            offset += part.length;
          }
        } else {
          // Ancien format fichier unique (blobUrl)
          const response = await fetch(`/api/file/${encodeURIComponent(code)}/download?file=${fi}&chunk=0`);
          if (!response.ok) {
            let msg = t('receive.error.download');
            try { const b = await response.json(); if (b.error) msg = b.error; } catch {}
            throw new Error(msg);
          }

          const reader = response.body.getReader();
          const parts = [];
          let loaded = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(value);
            loaded += value.length;
          }

          encryptedData = new Uint8Array(loaded);
          let offset = 0;
          for (const chunk of parts) {
            encryptedData.set(chunk, offset);
            offset += chunk.length;
          }

          chunksDownloaded++;
          setProgress(Math.round((chunksDownloaded / totalChunks) * 90));
        }

        // Déchiffrer
        if (totalFiles > 1) {
          setSubLabel(`${t('receive.decrypting.file')} ${fi + 1}/${totalFiles}…`);
        } else {
          setSubLabel(t('receive.decrypting'));
        }

        const decryptedBuffer = await decryptFile(encryptedData, cryptoKey);

        // Déclencher le téléchargement dans le navigateur
        const blob = new Blob([decryptedBuffer]);
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = file.originalName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      setProgress(100);
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
    setSubLabel('');
    setError('');
  }

  const showInput = status === 'idle' || status === 'loading' || status === 'error';
  const timeLocale = lang === 'fr' ? 'fr-FR' : 'en-GB';

  // Calculs multi-fichier
  const totalSize = fileInfo?.files?.reduce((s, f) => s + f.size, 0) || 0;
  const fileCount = fileInfo?.files?.length || 0;

  return (
    <main className="page">
      <BackButton />
      <h1>{t('receive.title')}</h1>

      {showInput && (
        <section className="code-input-area fade-in">
          <label htmlFor="code-input" className="code-input-label">
            {t('receive.code.label')}
          </label>
          <div className="code-input-row">
            <input
              id="code-input"
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder={t('receive.code.placeholder')}
              onKeyDown={(e) => e.key === 'Enter' && lookupCode()}
              className="code-input"
              autoFocus
            />
            <button
              className="btn btn--primary"
              onClick={() => lookupCode()}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? t('receive.checking') : t('receive.check')}
            </button>
          </div>

          {status === 'error' && <p className="error-text">{error}</p>}
        </section>
      )}

      {status === 'ready' && fileInfo && (
        <section className="file-ready fade-in">
          <div className="file-preview">
            {fileCount === 1 ? (
              <>
                <p className="file-name">{fileInfo.files[0].originalName}</p>
                <p className="file-meta">
                  {formatSize(fileInfo.files[0].size)}&nbsp;·&nbsp;{t('receive.expires')}&nbsp;
                  {new Date(fileInfo.expiresAt).toLocaleTimeString(timeLocale, {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </>
            ) : (
              <>
                <p className="file-name">
                  {fileCount} {t('receive.files.count')}
                </p>
                <ul className="file-list file-list--receive">
                  {fileInfo.files.map((f) => (
                    <li key={`${f.originalName}-${f.size}`} className="file-list__item fade-in">
                      <span className="file-list__name">{f.originalName}</span>
                      <span className="file-list__size">{formatSize(f.size)}</span>
                    </li>
                  ))}
                </ul>
                <p className="file-meta">
                  {formatSize(totalSize)}&nbsp;·&nbsp;{t('receive.expires')}&nbsp;
                  {new Date(fileInfo.expiresAt).toLocaleTimeString(timeLocale, {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </>
            )}
          </div>

          <div className="passphrase-field">
            <label htmlFor="passphrase-recv">{t('receive.password.label')}</label>
            <input
              id="passphrase-recv"
              type="text"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={t('receive.password.placeholder')}
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
            {t('receive.download')}
          </button>
        </section>
      )}

      {status === 'downloading' && (
        <div className="send-progress-card fade-in">
          <div className="send-progress-card__icon send-progress-card__icon--blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7 7 7-7"/>
              <path d="M19 3H5"/>
            </svg>
          </div>
          <p className="send-progress-card__title">{t('receive.downloading')}</p>
          <p className="send-progress-card__sub">
            {subLabel || (progress > 0 ? `${progress} %` : t('send.connecting'))}
          </p>
          {progress > 0
            ? <ProgressBar value={progress} />
            : <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label={t('receive.downloading')}>
                <div className="progress-bar__fill progress-bar__fill--indeterminate" />
              </div>
          }
        </div>
      )}

      {status === 'done' && (
        <div className="send-progress-card fade-in">
          <div className="send-progress-card__icon send-progress-card__icon--green" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p className="send-progress-card__title">
            {fileCount > 1 ? t('receive.success.multi', { count: fileCount }) : t('receive.success')}
          </p>
          <button className="btn btn--secondary" onClick={reset}>
            {t('receive.again')}
          </button>
        </div>
      )}

      {status === 'error' && !showInput && (
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
