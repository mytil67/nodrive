import { useI18n } from '../i18n/I18nContext.jsx';

export default function ProgressBar({ value }) {
  const { t } = useI18n();

  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={t('progress.aria', { value })}
    >
      <div
        className="progress-bar__fill"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
