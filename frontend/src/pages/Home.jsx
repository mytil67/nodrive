import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function Home() {
  const { t } = useI18n();

  const FEATURES = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      ),
      label: t('home.feature.aes'),
      desc: t('home.feature.aes.desc'),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/>
        </svg>
      ),
      label: t('home.feature.multi'),
      desc: t('home.feature.multi.desc'),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
        </svg>
      ),
      label: t('home.feature.expiry'),
      desc: t('home.feature.expiry.desc'),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
          <line x1="5" y1="10" x2="19" y2="10"/>
        </svg>
      ),
      label: t('home.feature.noaccount'),
      desc: t('home.feature.noaccount.desc'),
    },
  ];

  return (
    <main className="home">

      {/* -- Hero -- */}
      <div className="hero">
        <div className="hero__glow" aria-hidden="true" />
        <p className="hero__eyebrow">{t('home.eyebrow')}</p>
        <h1 className="hero__title">NoDrive</h1>
        <p className="hero__subtitle">
          {t('home.subtitle').split('\n').map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </p>
      </div>

      {/* -- Actions -- */}
      <div className="home-actions">
        <Link to="/send" className="action-card action-card--primary">
          <span className="action-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </span>
          <span className="action-card__body">
            <span className="action-card__title">{t('home.send')}</span>
            <span className="action-card__desc">{t('home.send.desc')}</span>
          </span>
          <span className="action-card__arrow" aria-hidden="true">{'→'}</span>
        </Link>

        <Link to="/receive" className="action-card action-card--secondary">
          <span className="action-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
          </span>
          <span className="action-card__body">
            <span className="action-card__title">{t('home.receive')}</span>
            <span className="action-card__desc">{t('home.receive.desc')}</span>
          </span>
          <span className="action-card__arrow" aria-hidden="true">{'→'}</span>
        </Link>
      </div>

      {/* -- Features -- */}
      <ul className="features" aria-label={t('home.features.aria')}>
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
