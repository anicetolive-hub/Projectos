import { formatDate } from "./labels";
import type { Alert } from "./types";

const CATEGORY_LABEL = { TASK: "Tarefa", PROJECT: "Projeto", KPI: "KPI", OBJECTIVE: "Objetivo" } as const;
const SEVERITY_LABEL = { CRITICAL: "Crítico", WARNING: "Atenção", INFO: "Info" } as const;
const SEVERITY_HEALTH = { CRITICAL: "RED", WARNING: "YELLOW", INFO: "NO_DATA" } as const;

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return <p className="hint">Sem alertas: todos os prazos e KPIs estão em dia. 🎉</p>;
  }
  return (
    <ul className="alert-list">
      {alerts.map((a) => (
        <li key={a.key} className={`alert-item severity-${a.severity}`}>
          <div className="alert-head">
            <span className={`badge health-${SEVERITY_HEALTH[a.severity]}`}>{SEVERITY_LABEL[a.severity]}</span>
            <span className="hint">{CATEGORY_LABEL[a.category]}</span>
            <strong>{a.title}</strong>
          </div>
          <div className="alert-body">
            {a.message}
            <span className="hint">
              {a.ownerName ? ` · Responsável: ${a.ownerName}` : " · Sem responsável"}
              {a.dueDate ? ` · Prazo: ${formatDate(a.dueDate)}` : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
