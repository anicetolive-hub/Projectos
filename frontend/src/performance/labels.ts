import type { Health, Priority, Role, TimingStatus } from "./types";

export const HEALTH_LABEL: Record<Health, string> = {
  GREEN: "Cumpre",
  YELLOW: "Atenção",
  RED: "Crítico",
  NO_DATA: "Sem dados",
};

export const TIMING_LABEL: Record<TimingStatus, string> = {
  DONE_ON_TIME: "Entregue no prazo",
  DONE_LATE: "Entregue com atraso",
  OVERDUE: "Em atraso",
  DUE_SOON: "Prazo a terminar",
  AT_RISK: "Em risco",
  ON_TRACK: "No prazo",
  CANCELLED: "Cancelada",
};

export const TIMING_HEALTH: Record<TimingStatus, Health> = {
  DONE_ON_TIME: "GREEN",
  DONE_LATE: "YELLOW",
  OVERDUE: "RED",
  DUE_SOON: "YELLOW",
  AT_RISK: "YELLOW",
  ON_TRACK: "GREEN",
  CANCELLED: "NO_DATA",
};

export const ROLE_LABEL: Record<Role, string> = {
  DIRECTOR: "Diretor",
  MANAGER: "Gestor",
  COORDINATOR: "Coordenador",
  STAFF: "Colaborador",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const TASK_STATUS_LABEL = {
  TODO: "Por iniciar",
  IN_PROGRESS: "Em curso",
  BLOCKED: "Bloqueada",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
} as const;

export const PROJECT_STATUS_LABEL = {
  PLANNED: "Planeado",
  IN_PROGRESS: "Em curso",
  ON_HOLD: "Em espera",
  DONE: "Concluído",
  CANCELLED: "Cancelado",
} as const;

export const FREQUENCY_LABEL = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
} as const;

export function formatDate(iso?: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-PT", { timeZone: "UTC" });
}

/** Converte uma data ISO para o valor de um <input type="date">. */
export function toDateInput(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function daysLabel(days: number): string {
  if (days === 0) return "hoje";
  if (days > 0) return `em ${days} dia(s)`;
  return `há ${-days} dia(s)`;
}

export function formatNumber(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined) return "—";
  const n = value.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
  if (!unit) return n;
  return unit === "%" ? `${n}%` : `${n} ${unit}`;
}


/** Mesmas faixas do backend (SCORE_BANDS): verde ≥ 90, amarelo ≥ 70. */
export function scoreHealth(score: number | null): Health {
  if (score === null) return "NO_DATA";
  if (score >= 90) return "GREEN";
  if (score >= 70) return "YELLOW";
  return "RED";
}

export const OBJECTIVE_LEVEL_LABEL = {
  STRATEGIC: "Estratégico",
  DIRECTION: "Direção",
  INDIVIDUAL: "Individual",
} as const;

export const ACHIEVEMENT_TYPE_LABEL = {
  SOLUTION: "Solução desenvolvida",
  IDEA: "Ideia inovadora",
  IMPROVEMENT: "Melhoria de processo",
  RECOGNITION: "Reconhecimento",
} as const;

export const ACHIEVEMENT_STATUS_LABEL = {
  PROPOSED: "Proposta",
  EVALUATING: "Em avaliação",
  APPROVED: "Aprovada",
  IMPLEMENTED: "Implementada",
  DISCARDED: "Posta de parte",
} as const;
