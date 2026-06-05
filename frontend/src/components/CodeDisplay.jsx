import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Affiche le code de transfert et le lien de téléchargement après un upload réussi.
 *
 * SÉCURITÉ : le lien contient la clé AES-GCM dans le fragment (#keyB64url).
 * Le fragment URL n'est jamais envoyé au serveur par le navigateur.
 * L'utilisateur doit partager le lien COMPLET pour que le destinataire puisse
 * déchiffrer le fichier.
 *
 * @param {string} code        - code court de transfert (ex : "AB3K7P")
 * @param {string} keyFragment - clé AES-GCM encodée base64url (jamais envoyée au serveur)
 */
export default function CodeDisplay({ code, keyFragment }) {
  const [copiedWhat, setCopiedWhat] = useState(null); // null | 'link' | 'code'

  // URL complète avec clé dans le fragment — ne jamais tronquer le #
  const receiveUrl = `${window.location.origin}/receive/${code}#${keyFragment}`;

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
      <div className="code-display__code" aria-live="polite">
        {code}
      </div>

      {/* Avertissement sécurité */}
      <div className="code-display__security-note">
        <span aria-hidden="true">🔒</span>
        <span>
          La clé de déchiffrement est incluse dans le lien ci-dessous.
          Elle n'a jamais quitté votre navigateur.
          <strong> Partagez le lien complet</strong>, pas seulement le code.
        </span>
      </div>

      {/* Actions de copie */}
      <div className="code-display__actions">
        <button
          className="btn btn--primary"
          onClick={() => copy(receiveUrl, 'link')}
        >
          {copiedWhat === 'link' ? '✓ Lien copié !' : 'Copier le lien complet'}
        </button>
        <button
          className="btn btn--outline"
          onClick={() => copy(code, 'code')}
        >
          {copiedWhat === 'code' ? '✓ Code copié' : 'Copier le code seul'}
        </button>
      </div>

      {/* Aperçu du lien (tronqué pour l'affichage) */}
      <div className="code-display__url-preview">
        <code className="code-display__url-text">
          {`/receive/${code}#`}
          <span className="code-display__url-key">{keyFragment.substring(0, 8)}…</span>
        </code>
      </div>

      <p className="code-display__hint">
        Sur l'autre machine, ouvrez ce lien ou rendez-vous sur{' '}
        <Link to="/receive">la page Recevoir</Link> et entrez le code.
      </p>
    </div>
  );
}
