import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Affiche le code de transfert et le mot de passe après un upload réussi.
 *
 * Le destinataire va sur /receive, saisit le code (6 chars) et le mot de passe.
 * La clé AES-GCM est dérivée de ces deux informations dans le navigateur (PBKDF2).
 * Rien de secret n'est jamais envoyé au serveur.
 *
 * @param {string} code       - code court de transfert (ex : "AB3K7P")
 * @param {string} passphrase - mot de passe saisi par l'expéditeur
 */
export default function CodeDisplay({ code, passphrase }) {
  const [copiedWhat, setCopiedWhat] = useState(null); // null | 'code' | 'pass'

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhat(what);
      setTimeout(() => setCopiedWhat(null), 2500);
    } catch {
      // Fallback silencieux si clipboard API indisponible
    }
  }

  return (
    <div className="code-display">
      <div className="code-display__success-badge" aria-hidden="true">✓</div>
      <p className="code-display__label">Fichier chiffré et envoyé</p>

      {/* Code court affiché en grand */}
      <div className="code-display__section">
        <p className="code-display__field-label">Code de transfert</p>
        <div className="code-display__code">{code}</div>
        <button
          className="btn btn--outline btn--sm"
          onClick={() => copy(code, 'code')}
        >
          {copiedWhat === 'code' ? '✓ Copié' : 'Copier le code'}
        </button>
      </div>

      {/* Mot de passe */}
      <div className="code-display__section">
        <p className="code-display__field-label">Mot de passe</p>
        <div className="code-display__passphrase">{passphrase}</div>
        <button
          className="btn btn--outline btn--sm"
          onClick={() => copy(passphrase, 'pass')}
        >
          {copiedWhat === 'pass' ? '✓ Copié' : 'Copier le mot de passe'}
        </button>
      </div>

      <p className="code-display__hint">
        Sur l'autre machine, ouvrez{' '}
        <Link to="/receive">la page Recevoir</Link>{' '}
        et saisissez le code et le mot de passe ci-dessus.
      </p>
    </div>
  );
}
