/* global __APP_VERSION__ */

import { useI18n } from '../i18n/I18nContext.jsx';

export default function Footer() {
  const { t, toggle } = useI18n();

  return (
    <footer className="app-footer">
      <span className="app-footer__version">v{__APP_VERSION__}</span>
      <span className="app-footer__sep" aria-hidden="true">·</span>
      <span>
        dev by{' '}
        <a
          href="https://github.com/mytil67"
          target="_blank"
          rel="noopener noreferrer"
          className="app-footer__link"
        >
          @mytil
        </a>
      </span>
      <span className="app-footer__sep" aria-hidden="true">·</span>
      <a
        href="https://github.com/mytil67/nodrive"
        target="_blank"
        rel="noopener noreferrer"
        className="app-footer__link"
      >
        GitHub
      </a>
      <span className="app-footer__sep" aria-hidden="true">·</span>
      <button className="app-footer__lang" onClick={toggle} aria-label="Switch language">
        {t('lang')}
      </button>
    </footer>
  );
}
