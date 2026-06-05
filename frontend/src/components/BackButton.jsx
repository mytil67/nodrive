import { Link } from 'react-router-dom';

/**
 * Bouton retour réutilisable, visible et accessible.
 * @param {string} to    - route cible (défaut : "/")
 * @param {string} label - texte affiché (défaut : "Retour")
 */
export default function BackButton({ to = '/', label = 'Retour' }) {
  return (
    <Link to={to} className="back-btn" aria-label={label}>
      <svg className="back-btn__icon" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
           aria-hidden="true">
        <path d="M19 12H5M12 5l-7 7 7 7"/>
      </svg>
      <span>{label}</span>
    </Link>
  );
}
