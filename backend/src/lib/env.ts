import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 3333),
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  auth: {
    // Duração de uma sessão de login, em horas
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  },
  performance: {
    // Tarefas/projetos a N dias (ou menos) do prazo geram alerta "prazo a terminar"
    dueSoonDays: Number(process.env.ALERT_DUE_SOON_DAYS ?? 3),
    // Intervalo da verificação periódica de alertas (0 desliga)
    checkIntervalMinutes: Number(process.env.ALERT_CHECK_INTERVAL_MINUTES ?? 60),
    // Webhook (Microsoft Teams / Slack) que recebe os novos alertas
    webhookUrl: process.env.ALERT_WEBHOOK_URL ?? "",
    // Severidade mínima enviada ao webhook: CRITICAL | WARNING | INFO
    webhookMinSeverity: (process.env.ALERT_WEBHOOK_MIN_SEVERITY ?? "WARNING").toUpperCase(),
  },
};
