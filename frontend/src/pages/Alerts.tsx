import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/context";
import { perfApi } from "../performance/api";
import { AlertList } from "../performance/AlertList";
import { useCurrentPersonId, useReloadOnExternalChange } from "../performance/hooks";
import type { Alert, AlertSeverity } from "../performance/types";

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [me] = useCurrentPersonId();
  const { user } = useAuth();
  const [onlyMine, setOnlyMine] = useState(false);
  const [severity, setSeverity] = useState<AlertSeverity | "">("");
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "denied"));
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    perfApi.alerts().then(setAlerts);
  }, []);
  useEffect(reload, [reload]);
  useReloadOnExternalChange(reload);

  async function enableBrowserNotifications() {
    if (!("Notification" in window)) return;
    setPermission(await Notification.requestPermission());
  }

  async function sendToWebhook() {
    setMessage(null);
    try {
      const { sent } = await perfApi.notifyAlerts();
      setMessage(sent > 0 ? `${sent} alerta(s) novo(s) enviado(s) ao webhook.` : "Nenhum alerta novo para enviar (ou webhook não configurado).");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Falha ao enviar alertas");
    }
  }

  if (!alerts) return <p className="hint">Carregando...</p>;

  const visible = alerts.filter((a) => (!onlyMine || a.ownerId === me) && (!severity || a.severity === severity));

  return (
    <div>
      <div className="page-header">
        <h2>Alertas</h2>
        <div className="actions">
          {permission !== "granted" && (
            <button className="btn secondary" onClick={enableBrowserNotifications} disabled={permission === "denied"}>
              {permission === "denied" ? "Notificações bloqueadas no navegador" : "Ativar notificações no navegador"}
            </button>
          )}
          {user?.isAdmin && (
            <button className="btn secondary" onClick={sendToWebhook}>
              Enviar novos para Teams/Slack
            </button>
          )}
        </div>
      </div>

      {message && <div className="card hint">{message}</div>}

      <div className="card">
        <div className="actions" style={{ marginBottom: "0.8rem", alignItems: "center" }}>
          <div className="segmented">
            {(
              [
                ["", `Todos (${alerts.length})`],
                ["CRITICAL", `Críticos (${alerts.filter((a) => a.severity === "CRITICAL").length})`],
                ["WARNING", `Atenção (${alerts.filter((a) => a.severity === "WARNING").length})`],
                ["INFO", `Info (${alerts.filter((a) => a.severity === "INFO").length})`],
              ] as [AlertSeverity | "", string][]
            ).map(([value, label]) => (
              <button key={value} className={severity === value ? "active" : ""} onClick={() => setSeverity(value)}>
                {label}
              </button>
            ))}
          </div>
          <label className="inline-label">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Só os meus
          </label>
        </div>
        <AlertList alerts={visible} />
      </div>

      <p className="hint">
        Os alertas são recalculados a cada consulta: tarefas, projetos e objetivos em atraso, com prazo a terminar ou com
        progresso abaixo do tempo consumido; KPIs abaixo da meta ou sem medição do último período. Com o painel aberto, os alertas
        críticos novos aparecem como notificação do navegador.
      </p>
    </div>
  );
}
