import { useCallback, useState, useRef } from 'react';
import { useI18n } from '../i18n/I18nContext.jsx';
import { formatSize } from '../utils/format.js';

export default function DropZone({ files, onFiles }) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback((fileList) => {
    if (!fileList || !fileList.length) return;
    const newFiles = [...(files || [])];
    for (const f of fileList) {
      if (!newFiles.some(ex => ex.name === f.name && ex.size === f.size)) {
        newFiles.push(f);
      }
    }
    onFiles(newFiles);
  }, [files, onFiles]);

  function removeFile(index) {
    const next = [...files];
    next.splice(index, 1);
    onFiles(next.length ? next : []);
  }

  function onDragOver(e)  { e.preventDefault(); setDragging(true); }
  function onDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }
  function onDrop(e)      { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }
  function onFileInput(e) { addFiles(e.target.files); e.target.value = ''; }
  function handleKeyDown(e) { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }

  const hasFiles = files && files.length > 0;

  return (
    <div className="dropzone-wrapper">
      <div
        role="button"
        tabIndex={0}
        aria-label={t('drop.aria')}
        className={['dropzone', dragging && 'dropzone--active', hasFiles && 'dropzone--has-file'].filter(Boolean).join(' ')}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
      >
        <input ref={inputRef} type="file" multiple className="visually-hidden" onChange={onFileInput} aria-hidden="true" />

        {!hasFiles ? (
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
            <p className="dropzone__sub-multi">{t('drop.drag.sub')}</p>
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
            <p className="dropzone__text">
              {files.length} {t('drop.files.count')}
            </p>
            <p className="dropzone__sub">{t('drop.add')}</p>
          </>
        )}
      </div>

      {hasFiles && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}`} className="file-list__item fade-in">
              <span className="file-list__name">{f.name}</span>
              <span className="file-list__size">{formatSize(f.size)}</span>
              <button
                className="file-list__remove"
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                aria-label={`${t('drop.remove')} ${f.name}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
