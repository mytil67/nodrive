import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelTransfer } from '../api/client.js';

/**
 * Affiche le code de transfert et le mot de passe après un upload réussi.
 * Permet également à l'expéditeur d'annuler le transfert via le deleteToken.
 *
 * @param {string}      code        - code court (ex : "AB3K7P")
 * @param {string}      passphrase  - mot de passe saisi par l'expéditeur
 * @param {string|null} deleteToken - token 128 bits pour annuler le transfert
 */
export default function CodeDisplay({ code, passphrase, deleteToken }) {
  const [copiedWhat,   setCopiedWhat]   = useState(null);   // null | 'code' | 'pass'
  const [cancelStatus, setCancelStatus] = useState('idle'); // idle | loading | done | error
  const [cancelError,  setCancelError]  = useState('');

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhat(what);
      setTimeout(() => setCopiedWhat(null), 2500);
    } catch {}
  }

  async function handleCancel() {
    if (!deleteToken || cancelStatus === 'loading') return;
    if (!window.confirm('Annuler ce transfert ? Le fichier sera supprimé définitivement.')) return;
    setCancelStatus('loading');
    try {
      await cancelTransfer(code, deleteToken);
      setCancelStatus('done');
    } catch (err) {
      setCancelError(err.message);
      setCancelStatus('error');
    }
  }

  if (cancelStatus === 'done') {
    return (
      <div className="code-display">
        <div className="code-display__success-badge code-display__success-badge--grey" aria-hidden="true">✕</div>
        <p className="code-display__label">Transfert annulé</p>
        <p className="code-display__hint">Le fichier a été supprimé du serveur.</p>
      </div>
    );
  }

  return (
    <div className="code-display">
      <div className="code-display__success-badge" aria-hidden="true">✓</div>
      <p className="code-display__label">Fichier chiffré et envoyé</p>

      {/* Code de transfert */}
      <div className="code-display__section">
        <p className="code-display__field-label">Code de transfert</p>
        <div className="code-display__code">{code}</div>
        <button className="btn btn--outline btn--sm" onClick={() => copy(code, 'code')}>
          {copiedWhat === 'code' ? '✓ Copié' : 'Copier le code'}
        </button>
      </div>

      {/* Mot de passe */}
      <div className="code-display__section">
        <p className="code-display__field-label">Mot de passe</p>
        <div className="code-display__passphrase">{passphrase}</div>
        <button className="btn btn--outline btn--sm" onClick={() => copy(passphrase, 'pass')}>
          {copiedWhat === 'pass' ? '✓ Copié' : 'Copier le mot de passe'}
        </button>
      </div>

      <p className="code-display__hint">
        Sur l'autre machine, ouvrez{' '}
        <Link to="/receive">la page Recevoir</Link>{' '}
        et saisissez le code et le mot de passe ci-dessus.
      </p>

      {/* Annulation — visible seulement si deleteToken disponible */}
      {deleteToken && (
        <div className="code-display__cancel">
          {cancelStatus === 'error' && (
            <p className="code-display__cancel-error">{cancelError}</p>
          )}
          <button
            className="btn btn--cancel"
            onClick={handleCancel}
            disabled={cancelStatus === 'loading'}
          >
            {cancelStatus === 'loading' ? 'Annulation…' : 'Annuler ce transfert'}
          </button>
        </div>
      )}
    </div>
  );
}
