import { HEALTH_LABEL, TIMING_HEALTH, TIMING_LABEL } from "./labels";
import type { Health, TimingStatus } from "./types";

export function HealthBadge({ health, label }: { health: Health; label?: string }) {
  return <span className={`badge health-${health}`}>{label ?? HEALTH_LABEL[health]}</span>;
}

export function TimingBadge({ timing }: { timing: TimingStatus }) {
  return <span className={`badge health-${TIMING_HEALTH[timing]}`}>{TIMING_LABEL[timing]}</span>;
}

export function ScoreValue({ score, health }: { score: number | null; health: Health }) {
  return <span className={`score health-text-${health}`}>{score === null ? "—" : score.toFixed(0)}</span>;
}

export function ProgressBar({ value, health = "GREEN" }: { value: number; health?: Health }) {
  return (
    <div className="progress" title={`${value}%`}>
      <div className={`progress-fill health-bg-${health}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
