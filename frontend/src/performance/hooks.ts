import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/context";
import { perfApi } from "./api";
import type { Alert } from "./types";

/** Id da pessoa com sessão iniciada (usado nos filtros "as minhas" / "os meus"). */
export function useCurrentPersonId(): [string] {
  return [useAuth().user?.id ?? ""];
}

// ---------------------------------------------------------------------------
// Alertas: consulta periódica + notificação do navegador para alertas críticos novos
// ---------------------------------------------------------------------------

const POLL_MS = 5 * 60 * 1000;
const SEEN_KEY = "perf.notifiedAlerts";

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(keys: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...keys]));
  } catch {
    // ignora: no pior caso, a notificação repete-se após recarregar
  }
}

export function useAlertWatcher() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const seen = useRef<Set<string>>(loadSeen());

  const refresh = useCallback(() => {
    perfApi
      .alerts()
      .then((list) => {
        setAlerts(list);
        const fresh = list.filter((a) => a.severity === "CRITICAL" && !seen.current.has(a.key));
        if (fresh.length > 0 && "Notification" in window && Notification.permission === "granted") {
          new Notification(`${fresh.length} alerta(s) crítico(s)`, {
            body: fresh.slice(0, 3).map((a) => a.title).join("\n"),
            tag: "perf-alerts",
          });
        }
        // Guarda apenas os alertas ainda ativos, para a lista não crescer indefinidamente
        seen.current = new Set(list.filter((a) => a.severity === "CRITICAL").map((a) => a.key));
        saveSeen(seen.current);
      })
      .catch(() => {
        // API indisponível: mantém a última lista conhecida
      });
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener("perf-data-changed", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("perf-data-changed", refresh);
    };
  }, [refresh]);

  return alerts;
}

/** Avisa o contador de alertas de que os dados mudaram (tarefa concluída, KPI registado...). */
export function notifyDataChanged() {
  window.dispatchEvent(new Event("perf-data-changed"));
}
