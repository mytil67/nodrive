/**
 * Barre de progression accessible.
 * @param {number} value - valeur entre 0 et 100
 */
export default function ProgressBar({ value }) {
  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Progression : ${value} %`}
    >
      <div
        className="progress-bar__fill"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
