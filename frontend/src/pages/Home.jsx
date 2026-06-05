import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    label: 'Chiffré AES-256',
    desc: 'Le fichier est chiffré dans votre navigateur avant envoi',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    label: 'Supprimé après 24 h',
    desc: 'Aucune donnée conservée au-delà de la durée de vie du transfert',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
        <line x1="5" y1="10" x2="19" y2="10"/>
      </svg>
    ),
    label: 'Sans compte',
    desc: 'Aucune inscription, aucune installation requise',
  },
];

export default function Home() {
  return (
    <main className="home">

      {/* ── Hero ── */}
      <div className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <p className="hero__eyebrow">Transfert de fichiers</p>
        <h1 className="hero__title">NoDrive</h1>
        <p className="hero__subtitle">
          Envoyez un fichier d'une machine à une autre.<br />
          Un code. Un mot de passe. C'est tout.
        </p>
      </div>

      {/* ── Actions ── */}
      <div className="home-actions">
        <Link to="/send" className="action-card action-card--primary">
          <span className="action-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </span>
          <span className="action-card__body">
            <span className="action-card__title">Envoyer un fichier</span>
            <span className="action-card__desc">Chiffrer et partager en quelques secondes</span>
          </span>
          <span className="action-card__arrow" aria-hidden="true">→</span>
        </Link>

        <Link to="/receive" className="action-card action-card--secondary">
          <span className="action-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
          </span>
          <span className="action-card__body">
            <span className="action-card__title">Recevoir un fichier</span>
            <span className="action-card__desc">Entrez le code et le mot de passe</span>
          </span>
          <span className="action-card__arrow" aria-hidden="true">→</span>
        </Link>
      </div>

      {/* ── Features ── */}
      <ul className="features" aria-label="Caractéristiques">
        {FEATURES.map(({ icon, label, desc }) => (
          <li key={label} className="feature">
            <span className="feature__icon">{icon}</span>
            <span className="feature__label">{label}</span>
            <span className="feature__desc">{desc}</span>
          </li>
        ))}
      </ul>

    </main>
  );
}
