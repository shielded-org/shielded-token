type Props = {
  title: string;
  phase: string;
  progress: number;
};

export function ProgressScreen({title, phase, progress}: Props) {
  return (
    <div className="progress-overlay">
      <div className="progress-card">
        <div className="shield-pulse">🛡</div>
        <h3>{title}</h3>
        <div className="progress-bar">
          <div className="progress-fill" style={{width: `${Math.max(8, Math.min(progress, 100))}%`}} />
        </div>
        <p className="progress-percent">{Math.round(progress)}%</p>
        <p className="muted">{phase}</p>
        <p className="muted">Please keep this window open.</p>
      </div>
    </div>
  );
}
