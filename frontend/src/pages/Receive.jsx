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

      let encryptedData;

      if (fileInfo.chunkCount > 0) {
        // ── Mode chunked : télécharger chaque chunk séparément ──
        const parts = [];
        let totalLoaded = 0;

        for (let i = 0; i < fileInfo.chunkCount; i++) {
          const response = await fetch(
            `/api/file/${encodeURIComponent(code)}/download?chunk=${i}`
          );
          if (!response.ok) {
            let msg = `${t('receive.error.download')} (chunk ${i}, HTTP ${response.status})`;
            try { const b = await response.json(); if (b.error) msg = b.error; } catch {}
            throw new Error(msg);
          }

          const reader = response.body.getReader();
          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            totalLoaded += value.length;
          }

          for (const c of chunks) parts.push(c);
          setProgress(Math.round(((i + 1) / fileInfo.chunkCount) * 100));
        }

        encryptedData = new Uint8Array(totalLoaded);
        let offset = 0;
        for (const part of parts) {
          encryptedData.set(part, offset);
          offset += part.length;
        }
      } else {
        // ── Mode fichier unique ──
        const response = await fetch(`/api/file/${encodeURIComponent(code)}/download`);
        if (!response.ok) {
          let msg = t('receive.error.download');
          try { const b = await response.json(); if (b.error) msg = b.error; } catch {}
          throw new Error(msg);
        }

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

        encryptedData = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          encryptedData.set(chunk, offset);
          offset += chunk.length;
        }
      }

      setStatus('decrypting');
      const cryptoKey       = await deriveKeyFromPassphrase(pass, fileInfo.salt, 'decrypt');
      const decryptedBuffer = await decryptFile(encryptedData, cryptoKey);

      const blob = new Blob([decryptedBuffer]);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = fileInfo.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

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
  const timeLocale = lang === 'fr' ? 'fr-FR' : 'en-GB';

  return (
    <main className="page">
      <BackButton />
      <h1>{t('receive.title')}</h1>

      {showInput && (
        <section className="code-input-area">
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
        <section className="file-ready">
          <div className="file-preview">
            <p className="file-name">{fileInfo.originalName}</p>
            <p className="file-meta">
              {formatSize(fileInfo.size)}&nbsp;·&nbsp;{t('receive.expires')}&nbsp;
              {new Date(fileInfo.expiresAt).toLocaleTimeString(timeLocale, {
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
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
        <section className="upload-progress">
          <p>{t('receive.downloading')}</p>
          <ProgressBar value={progress} />
          {progress > 0 && <p className="progress-pct">{progress} %</p>}
        </section>
      )}

      {status === 'decrypting' && (
        <section className="upload-progress">
          <p>{t('receive.decrypting')}</p>
          <div className="progress-bar progress-bar--indeterminate" role="progressbar" aria-label={t('receive.decrypting.aria')}>
            <div className="progress-bar__fill progress-bar__fill--indeterminate" />
          </div>
        </section>
      )}

      {status === 'done' && (
        <section className="success-box">
          <p>{t('receive.success')}</p>
          <button className="btn btn--secondary" onClick={reset}>
            {t('receive.again')}
          </button>
        </section>
      )}
    </main>
  );
}
