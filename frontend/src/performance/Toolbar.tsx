import { Link } from "react-router-dom";
import { AccountMenu } from "../auth/AccountMenu";
import { useAlertWatcher } from "./hooks";

/** Contador de alertas (já filtrados pelo âmbito do utilizador) + menu da conta. */
export function PerformanceToolbar() {
  const alerts = useAlertWatcher();
  const critical = alerts.filter((a) => a.severity === "CRITICAL").length;
  const warning = alerts.filter((a) => a.severity === "WARNING").length;

  return (
    <div className="toolbar">
      <Link
        to="/alertas"
        className={`alert-bell ${critical ? "has-critical" : warning ? "has-warning" : ""}`}
        title="Alertas (críticos / atenção)"
      >
        🔔 {critical}
        <span className="hint"> / {warning}</span>
      </Link>
      <AccountMenu />
    </div>
  );
}
