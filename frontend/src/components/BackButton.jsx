import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function BackButton({ to = '/' }) {
  const { t } = useI18n();
  const label = t('back');

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
