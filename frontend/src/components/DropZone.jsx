import { useCallback, useState, useRef } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function DropZone({ file, onFile }) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback((f) => { if (f) onFile(f); }, [onFile]);

  function onDragOver(e)  { e.preventDefault(); setDragging(true); }
  function onDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }
  function onDrop(e)      { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }
  function onFileInput(e) { handleFile(e.target.files[0]); e.target.value = ''; }
  function handleKeyDown(e) { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('drop.aria')}
      className={['dropzone', dragging && 'dropzone--active', file && 'dropzone--has-file'].filter(Boolean).join(' ')}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={handleKeyDown}
    >
      <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={onFileInput} aria-hidden="true" />

      {!file ? (
        <>
          <span className="dropzone__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </span>
          <p className="dropzone__text">{dragging ? t('drop.release') : t('drop.drag')}</p>
          <p className="dropzone__sub">{t('drop.or')}<span className="dropzone__browse">{t('drop.browse')}</span></p>
        </>
      ) : (
        <>
          <span className="dropzone__icon dropzone__icon--ok" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <p className="dropzone__filename">{file.name}</p>
          <p className="dropzone__sub">{t('drop.change')}</p>
        </>
      )}
    </div>
  );
}
