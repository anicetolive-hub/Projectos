import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { Alert, AlertSeverity } from "./engine";
import { loadSnapshot } from "./snapshot";

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
const SEVERITY_ICON: Record<AlertSeverity, string> = { CRITICAL: "🔴", WARNING: "🟡", INFO: "🔵" };

/**
 * Verifica os alertas atuais e envia ao webhook apenas os que ainda não foram
 * notificados. Sem webhook configurado, não faz nada (os alertas continuam
 * visíveis no painel web, que os calcula em tempo real).
 */
export async function notifyNewAlerts(): Promise<{ sent: number }> {
  const { webhookUrl, webhookMinSeverity } = env.performance;
  if (!webhookUrl) return { sent: 0 };

  const minRank = SEVERITY_RANK[webhookMinSeverity as AlertSeverity] ?? SEVERITY_RANK.WARNING;
  const { alerts } = await loadSnapshot();
  const eligible = alerts.filter((a) => SEVERITY_RANK[a.severity] <= minRank);
  if (eligible.length === 0) return { sent: 0 };

  const already = await prisma.alertNotification.findMany({
    where: { alertKey: { in: eligible.map((a) => a.key) } },
    select: { alertKey: true },
  });
  const notified = new Set(already.map((a) => a.alertKey));
  const fresh = eligible.filter((a) => !notified.has(a.key));
  if (fresh.length === 0) return { sent: 0 };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: formatMessage(fresh) }),
  });
  if (!response.ok) {
    throw new Error(`Webhook de alertas respondeu ${response.status}: ${await response.text()}`);
  }

  await prisma.$transaction(fresh.map((a) => prisma.alertNotification.create({ data: { alertKey: a.key } })));
  return { sent: fresh.length };
}

function formatMessage(alerts: Alert[]): string {
  const lines = alerts.map((a) => {
    const owner = a.ownerName ? ` — responsável: ${a.ownerName}` : "";
    return `${SEVERITY_ICON[a.severity]} **${a.title}**${owner}  \n${a.message}`;
  });
  return [`**Gestão de Performance: ${alerts.length} alerta(s) novo(s)**`, ...lines].join("\n\n");
}

export function startAlertScheduler(): void {
  const minutes = env.performance.checkIntervalMinutes;
  if (!env.performance.webhookUrl || !(minutes > 0)) return;

  const run = () =>
    notifyNewAlerts()
      .then(({ sent }) => sent > 0 && console.log(`[alertas] ${sent} alerta(s) enviado(s) ao webhook`))
      .catch((err) => console.error("[alertas] falha ao notificar:", err));

  run();
  setInterval(run, minutes * 60 * 1000).unref();
  console.log(`[alertas] verificação a cada ${minutes} min; envio para o webhook configurado`);
}
