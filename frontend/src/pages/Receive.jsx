import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import BackButton from '../components/BackButton.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import { getFileInfo } from '../api/client.js';
import { deriveKeyAndVerifier, decryptFile } from '../utils/crypto.js';
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
  const [savedFiles,   setSavedFiles]   = useState([]); // { name, url } — blobs déchiffrés
  const [showPass,     setShowPass]     = useState(false);

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
      // Mapping fiable via le status HTTP (indépendant de la langue du serveur)
      switch (err.status) {
        case 400: setError(t('receive.error.invalid'));  break;
        case 404: setError(t('receive.error.notfound')); break;
        case 410: setError(t('receive.error.expired'));  break;
        default:  setError(err.message || t('receive.error.download'));
      }
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

      const { key: cryptoKey, verifier } = await deriveKeyAndVerifier(pass, fileInfo.salt, 'decrypt');

      // Récupérer les noms de fichiers : ils ne sont révélés qu'avec le bon
      // verifier (preuve de mot de passe). Un mot de passe erroné est détecté
      // ici (403), avant tout téléchargement — rien n'est consommé.
      let files;
      try {
        const detailed = await getFileInfo(code, verifier);
        files = detailed.files;
      } catch (err) {
        if (err.status === 403) throw new Error(t('receive.error.badpassword'));
        throw err;
      }
      if (!files || !files.length) throw new Error(t('receive.error.download'));
      const totalFiles = files.length;

      // Calculer le nombre total de chunks pour la progression globale
      let totalChunks = 0;
      for (const f of files) {
        totalChunks += Math.max(1, f.chunkCount);
      }
      let chunksDownloaded = 0;

      const fetchOpts = { headers: { 'x-blob-verifier': verifier } };
      const downloaded = [];

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
              `/api/file/${encodeURIComponent(code)}/download?file=${fi}&chunk=${ci}`,
              fetchOpts
            );
            if (!response.ok) {
              if (response.status === 403) throw new Error(t('receive.error.badpassword'));
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
          const response = await fetch(`/api/file/${encodeURIComponent(code)}/download?file=${fi}&chunk=0`, fetchOpts);
          if (!response.ok) {
            if (response.status === 403) throw new Error(t('receive.error.badpassword'));
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

        // Conserver le blob : les navigateurs bloquent les téléchargements
        // automatiques multiples — on propose aussi un bouton par fichier.
        const blob = new Blob([decryptedBuffer]);
        const url  = URL.createObjectURL(blob);
        downloaded.push({ name: file.originalName, url });

        // Déclencher le téléchargement dans le navigateur
        const a    = document.createElement('a');
        a.href     = url;
        a.download = file.originalName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      setSavedFiles(downloaded);

      // Le quota est consommé côté serveur dès que le dernier chunk a été servi
      // (voir api/file/[code]/download.js) — aucune confirmation client requise.
      setProgress(100);
      setStatus('done');

    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  function reset() {
    for (const f of savedFiles) URL.revokeObjectURL(f.url);
    setSavedFiles([]);
    setInputCode('');
    setPassphrase('');
    setFileInfo(null);
    setStatus('idle');
    setProgress(0);
    setSubLabel('');
    setError('');
    setShowPass(false);
  }

  const showInput = status === 'idle' || status === 'loading' || status === 'error';

  // Aperçu : on s'appuie sur le sous-ensemble non sensible renvoyé par /info
  // (les noms ne sont récupérés qu'au moment du téléchargement, avec le verifier).
  const totalSize = fileInfo?.totalSize || 0;
  const fileCount = fileInfo?.fileCount || 0;

  // Temps restant en format lisible
  function formatRemaining() {
    if (!fileInfo?.expiresAt) return '';
    const diff = fileInfo.expiresAt - Date.now();
    if (diff <= 0) return lang === 'fr' ? 'expiré' : 'expired';
    const mins = Math.ceil(diff / 60_000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }

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
              onChange={(e) => setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={6}
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
            {/* Aperçu sans les noms : ils restent confidentiels tant que le mot
                de passe (verifier) n'est pas fourni — voir api/.../info.js (#3). */}
            <p className="file-name">
              {fileCount} {fileCount > 1 ? t('receive.files.count') : t('receive.files.one')}
            </p>
            <p className="file-meta">{formatSize(totalSize)}</p>
            <p className="file-names-hidden">{t('receive.names.hidden')}</p>
            <p className="file-expiry-info">
              <span className="file-expiry-info__single">{t('receive.expires.single')}</span>
              <span className="file-expiry-info__time">{t('receive.expires.time', { remaining: formatRemaining() })}</span>
            </p>
          </div>

          <div className="passphrase-field">
            <label htmlFor="passphrase-recv">{t('receive.password.label')}</label>
            <div className="passphrase-row">
              <input
                id="passphrase-recv"
                type={showPass ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder={t('receive.password.placeholder')}
                className="code-input"
                autoComplete="off"
                autoFocus
                aria-label={t('receive.password.aria')}
                onKeyDown={(e) => e.key === 'Enter' && passphrase.trim() && handleDownload()}
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
          <p className="send-progress-card__sub send-progress-card__sub--success">
            {fileCount > 1 ? t('receive.success.multi.sub') : t('receive.success.sub')}
          </p>
          {savedFiles.length > 1 && (
            <>
              <p className="saved-files__hint">{t('receive.saved.hint')}</p>
              <ul className="file-list file-list--receive">
                {savedFiles.map((f) => (
                  <li key={f.url} className="file-list__item">
                    <span className="file-list__name">{f.name}</span>
                    <a className="btn btn--outline btn--sm" href={f.url} download={f.name}>
                      {t('receive.saved.save')}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
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
