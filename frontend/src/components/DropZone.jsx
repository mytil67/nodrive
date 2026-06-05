import { useCallback, useState, useRef } from 'react';

/**
 * Zone de dépôt de fichier (drag and drop + clic).
 * @param {File|null} file - fichier actuellement sélectionné
 * @param {(f: File) => void} onFile - callback appelé quand un fichier est déposé ou sélectionné
 */
export default function DropZone({ file, onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback(
    (f) => {
      if (f) onFile(f);
    },
    [onFile]
  );

  function onDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave(e) {
    // Ignore les événements venant des enfants
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragging(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function onFileInput(e) {
    const f = e.target.files[0];
    if (f) handleFile(f);
    // Réinitialise l'input pour permettre de resélectionner le même fichier
    e.target.value = '';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Zone de dépôt de fichier — cliquez ou glissez un fichier ici"
      className={[
        'dropzone',
        dragging ? 'dropzone--active' : '',
        file ? 'dropzone--has-file' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={onFileInput}
        aria-hidden="true"
      />

      {!file && (
        <>
          <span className="dropzone__icon" aria-hidden="true">📁</span>
          <p className="dropzone__text">Glissez-déposez un fichier ici</p>
          <p className="dropzone__sub">ou cliquez pour sélectionner</p>
        </>
      )}

      {file && (
        <>
          <span className="dropzone__icon" aria-hidden="true">✅</span>
          <p className="dropzone__filename">{file.name}</p>
          <p className="dropzone__sub">Cliquez pour changer le fichier</p>
        </>
      )}
    </div>
  );
}
