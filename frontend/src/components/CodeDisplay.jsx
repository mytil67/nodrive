import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cancelTransfer } from '../api/client.js';
import { generate } from 'lean-qr';
import { toSvgDataURL } from 'lean-qr/extras/svg';
import { useI18n } from '../i18n/I18nContext.jsx';

export default function CodeDisplay({ code, passphrase, deleteToken, fileCount }) {
  const { t } = useI18n();
  const [copiedWhat,   setCopiedWhat]   = useState(null);
  const [cancelStatus, setCancelStatus] = useState('idle');
  const [cancelError,  setCancelError]  = useState('');

  const receiveUrl = `${window.location.origin}/receive/${code}`;
  const qrDataUrl  = useMemo(() => {
    const qr = generate(receiveUrl);
    return toSvgDataURL(qr, { on: '#ffffff', off: 'transparent' });
  }, [receiveUrl]);

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhat(what);
      setTimeout(() => setCopiedWhat(null), 2500);
    } catch {}
  }

  async function handleCancel() {
    if (!deleteToken || cancelStatus === 'loading') return;
    if (!window.confirm(t('code.cancel.confirm'))) return;
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
        <p className="code-display__label">{t('code.cancelled')}</p>
        <p className="code-display__hint">{t('code.cancelled.hint')}</p>
      </div>
    );
  }

  return (
    <div className="code-display">
      <div className="code-display__success-badge" aria-hidden="true">✓</div>
      <p className="code-display__label">{fileCount > 1 ? t('code.sent.multi') : t('code.sent')}</p>

      <div className="code-display__section">
        <p className="code-display__field-label">{t('code.transfer')}</p>
        <div className="code-display__code">{code}</div>
        <button className="btn btn--outline btn--sm" onClick={() => copy(code, 'code')}>
          {copiedWhat === 'code' ? t('code.copied') : t('code.copy.code')}
        </button>
      </div>

      <div className="code-display__section">
        <p className="code-display__field-label">{t('code.password')}</p>
        <div className="code-display__passphrase">{passphrase}</div>
        <button className="btn btn--outline btn--sm" onClick={() => copy(passphrase, 'pass')}>
          {copiedWhat === 'pass' ? t('code.copied') : t('code.copy.password')}
        </button>
      </div>

      <div className="code-display__qr">
        <p className="code-display__field-label">{t('code.qr.label')}</p>
        <img src={qrDataUrl} alt={`QR code — ${receiveUrl}`} className="code-display__qr-img" />
      </div>

      <p className="code-display__hint">
        {t('code.hint')}{' '}
        <Link to="/receive">{t('code.hint.link')}</Link>{' '}
        {t('code.hint.end')}
      </p>

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
            {cancelStatus === 'loading' ? t('code.cancelling') : t('code.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
