// Motor de cálculo do módulo de performance: funções puras (sem acesso ao
// banco) para atingimento de KPIs, situação de prazos de tarefas/projetos,
// pontuação de pessoas/departamentos e geração de alertas.

export type Health = "GREEN" | "YELLOW" | "RED" | "NO_DATA";
export type KpiDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
export type KpiFrequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type TimingStatus =
  | "DONE_ON_TIME"
  | "DONE_LATE"
  | "OVERDUE"
  | "DUE_SOON"
  | "AT_RISK"
  | "ON_TRACK"
  | "CANCELLED";
export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

// Peso de cada componente na nota final de uma pessoa ou departamento.
// Quando falta um componente (ex: sem objetivos), os restantes são reponderados.
export const SCORE_WEIGHTS = { kpi: 0.5, objectives: 0.2, delivery: 0.3 };
// Faixas da nota final (0-100+): >= GREEN fica verde, >= YELLOW amarelo, abaixo vermelho.
export const SCORE_BANDS = { GREEN: 90, YELLOW: 70 };
// Atingimento máximo considerado: evita que um KPI muito acima da meta esconda os restantes.
export const MAX_ATTAINMENT = 120;
// Janela de avaliação da entrega de tarefas (prazos vencidos nos últimos N dias).
export const DELIVERY_WINDOW_DAYS = 90;
// Uma tarefa fica "em risco" quando o prazo consumido supera o progresso nesta margem.
export const AT_RISK_GAP = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export function kpiAttainment(value: number, target: number, direction: KpiDirection): number {
  let attainment: number;
  if (direction === "LOWER_IS_BETTER") {
    if (value <= 0) attainment = MAX_ATTAINMENT;
    else if (target <= 0) attainment = 0;
    else attainment = (target / value) * 100;
  } else if (target <= 0) {
    attainment = value >= target ? 100 : 0;
  } else {
    attainment = (value / target) * 100;
  }
  return round1(Math.max(0, Math.min(MAX_ATTAINMENT, attainment)));
}

export function kpiHealth(attainment: number | null, warningThreshold: number): Health {
  if (attainment === null) return "NO_DATA";
  if (attainment >= 100) return "GREEN";
  if (attainment >= warningThreshold) return "YELLOW";
  return "RED";
}

export function scoreHealth(score: number | null): Health {
  if (score === null) return "NO_DATA";
  if (score >= SCORE_BANDS.GREEN) return "GREEN";
  if (score >= SCORE_BANDS.YELLOW) return "YELLOW";
  return "RED";
}

/** Identificador do período que contém `date`, ex: "2026-10", "2026-Q4", "2026-W43", "2026". */
export function periodOf(frequency: KpiFrequency, date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  switch (frequency) {
    case "YEARLY":
      return String(year);
    case "QUARTERLY":
      return `${year}-Q${Math.ceil(month / 3)}`;
    case "WEEKLY": {
      const { isoYear, week } = isoWeek(date);
      return `${isoYear}-W${String(week).padStart(2, "0")}`;
    }
    default:
      return `${year}-${String(month).padStart(2, "0")}`;
  }
}

/** Último período já encerrado (aquele cuja medição já deveria ter sido registada). */
export function lastClosedPeriod(frequency: KpiFrequency, now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (frequency) {
    case "YEARLY":
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      break;
    case "QUARTERLY":
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - 3);
      break;
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    default:
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return periodOf(frequency, d);
}

function isoWeek(date: Date): { isoYear: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return { isoYear: d.getUTCFullYear(), week };
}

export interface KpiInput {
  id: string;
  name: string;
  unit?: string | null;
  direction: KpiDirection;
  frequency: KpiFrequency;
  target: number;
  warningThreshold: number;
  weight: number;
  departmentId?: string | null;
  ownerId?: string | null;
  // Medições em qualquer ordem
  measurements: { period: string; value: number }[];
}

export interface KpiEvaluation {
  kpiId: string;
  latestPeriod: string | null;
  latestValue: number | null;
  attainment: number | null;
  health: Health;
  trend: "UP" | "DOWN" | "STABLE" | null; // variação do atingimento face à medição anterior
  missingLastPeriod: boolean;
  expectedPeriod: string;
}

export function evaluateKpi(kpi: KpiInput, now: Date): KpiEvaluation {
  const sorted = [...kpi.measurements].sort((a, b) => b.period.localeCompare(a.period));
  const latest = sorted[0];
  const previous = sorted[1];
  const attainment = latest ? kpiAttainment(latest.value, kpi.target, kpi.direction) : null;
  const previousAttainment = previous ? kpiAttainment(previous.value, kpi.target, kpi.direction) : null;

  let trend: KpiEvaluation["trend"] = null;
  if (attainment !== null && previousAttainment !== null) {
    const delta = attainment - previousAttainment;
    trend = Math.abs(delta) < 1 ? "STABLE" : delta > 0 ? "UP" : "DOWN";
  }

  const expectedPeriod = lastClosedPeriod(kpi.frequency, now);
  return {
    kpiId: kpi.id,
    latestPeriod: latest?.period ?? null,
    latestValue: latest?.value ?? null,
    attainment,
    health: kpiHealth(attainment, kpi.warningThreshold),
    trend,
    missingLastPeriod: !latest || latest.period < expectedPeriod,
    expectedPeriod,
  };
}

/** Média ponderada do atingimento (pelo peso de cada KPI); null se nenhum tiver medição. */
export function weightedKpiScore(items: { attainment: number | null; weight: number }[]): number | null {
  const valid = items.filter((i) => i.attainment !== null && i.weight > 0);
  const totalWeight = valid.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight === 0) return null;
  return round1(valid.reduce((sum, i) => sum + (i.attainment as number) * i.weight, 0) / totalWeight);
}

// ---------------------------------------------------------------------------
// Prazos (tarefas e projetos)
// ---------------------------------------------------------------------------

export interface ScheduleInput {
  status: string;
  progress: number; // 0-100
  startDate?: Date | null;
  createdAt: Date;
  dueDate: Date;
  completedAt?: Date | null;
}

export interface ScheduleEvaluation {
  timing: TimingStatus;
  deadline: Date;
  daysRemaining: number; // negativo quando em atraso
  elapsedPct: number | null; // % do prazo já consumido
}

/**
 * Datas sem hora (meia-noite UTC, como chegam de um <input type="date">)
 * vencem no fim desse dia; datas com hora vencem no instante indicado.
 */
export function deadlineOf(dueDate: Date): Date {
  const isDateOnly =
    dueDate.getUTCHours() === 0 &&
    dueDate.getUTCMinutes() === 0 &&
    dueDate.getUTCSeconds() === 0 &&
    dueDate.getUTCMilliseconds() === 0;
  return isDateOnly ? new Date(dueDate.getTime() + DAY_MS - 1) : dueDate;
}

export function evaluateSchedule(item: ScheduleInput, now: Date, dueSoonDays: number): ScheduleEvaluation {
  const deadline = deadlineOf(item.dueDate);
  // Diferença em dias de calendário: 0 = vence hoje, -1 = venceu ontem
  const daysRemaining = Math.round((startOfDayUTC(deadline) - startOfDayUTC(now)) / DAY_MS);
  const start = item.startDate ?? item.createdAt;
  const span = deadline.getTime() - start.getTime();
  const elapsedPct = span > 0 ? round1(clamp(((now.getTime() - start.getTime()) / span) * 100, 0, 100)) : null;

  const base = { deadline, daysRemaining, elapsedPct };

  if (item.status === "CANCELLED") return { ...base, timing: "CANCELLED" };
  if (item.status === "DONE") {
    const completedAt = item.completedAt ?? now;
    return { ...base, timing: completedAt.getTime() <= deadline.getTime() ? "DONE_ON_TIME" : "DONE_LATE" };
  }
  if (now.getTime() > deadline.getTime()) return { ...base, timing: "OVERDUE" };
  if (daysRemaining <= dueSoonDays) return { ...base, timing: "DUE_SOON" };
  if (item.status === "BLOCKED" || item.status === "ON_HOLD") return { ...base, timing: "AT_RISK" };
  if (elapsedPct !== null && elapsedPct >= 50 && elapsedPct - item.progress >= AT_RISK_GAP) {
    return { ...base, timing: "AT_RISK" };
  }
  return { ...base, timing: "ON_TRACK" };
}

/** Progresso de um projeto: média do progresso das tarefas não canceladas (concluídas contam 100%). */
export function projectProgress(tasks: { status: string; progress: number }[]): number {
  const relevant = tasks.filter((t) => t.status !== "CANCELLED");
  if (relevant.length === 0) return 0;
  const total = relevant.reduce((sum, t) => sum + (t.status === "DONE" ? 100 : clamp(t.progress, 0, 100)), 0);
  return Math.round(total / relevant.length);
}

/**
 * Nota de entrega (0-100) a partir das tarefas com prazo dentro da janela:
 * concluída no prazo = 1, concluída com atraso = 0,5, em atraso = 0.
 * Tarefas ainda dentro do prazo não contam (não há o que avaliar).
 */
export function deliveryScore(tasks: ScheduleInput[], now: Date, windowDays = DELIVERY_WINDOW_DAYS): number | null {
  const windowStart = now.getTime() - windowDays * DAY_MS;
  let points = 0;
  let count = 0;
  for (const task of tasks) {
    if (task.status === "CANCELLED") continue;
    const deadline = deadlineOf(task.dueDate).getTime();
    const evaluatedAt = task.status === "DONE" ? Math.min(deadline, (task.completedAt ?? now).getTime()) : deadline;
    if (evaluatedAt < windowStart) continue;

    const { timing } = evaluateSchedule(task, now, 0);
    if (timing === "DONE_ON_TIME") points += 1;
    else if (timing === "DONE_LATE") points += 0.5;
    else if (timing !== "OVERDUE") continue; // aberta e dentro do prazo
    count += 1;
  }
  return count === 0 ? null : round1((points / count) * 100);
}

export function combineScores(parts: { kpi: number | null; objectives: number | null; delivery: number | null }): number | null {
  let total = 0;
  let weight = 0;
  for (const key of Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]) {
    const value = parts[key];
    if (value === null) continue;
    total += value * SCORE_WEIGHTS[key];
    weight += SCORE_WEIGHTS[key];
  }
  return weight === 0 ? null : round1(total / weight);
}

// ---------------------------------------------------------------------------
// Objetivos (estratégicos → direção → individuais)
// ---------------------------------------------------------------------------

export interface ObjectiveInput {
  id: string;
  parentId: string | null;
  status: string; // ACTIVE | ACHIEVED | CANCELLED
  weight: number;
  progress: number; // manual
}

export interface ObjectiveProgress {
  progress: number;
  source: "LINKED" | "MANUAL";
}

/**
 * Progresso de cada objetivo: média ponderada do que está ligado a ele
 * (atingimento dos KPIs limitado a 100%, progresso dos projetos e dos
 * objetivos filhos não cancelados). Sem nada ligado com dados, vale o
 * progresso manual. Objetivos alcançados valem 100%.
 */
export function computeObjectiveProgress(
  objectives: ObjectiveInput[],
  kpis: { objectiveId: string | null; attainment: number | null; weight: number }[],
  projects: { objectiveId: string | null; progress: number; status: string }[],
): Map<string, ObjectiveProgress> {
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const result = new Map<string, ObjectiveProgress>();
  const visiting = new Set<string>();

  const compute = (id: string): ObjectiveProgress => {
    const cached = result.get(id);
    if (cached) return cached;
    const objective = byId.get(id) as ObjectiveInput;
    if (objective.status === "ACHIEVED") return remember(id, { progress: 100, source: "MANUAL" });
    if (visiting.has(id)) return { progress: clamp(objective.progress, 0, 100), source: "MANUAL" }; // ciclo
    visiting.add(id);

    const items: { value: number; weight: number }[] = [];
    for (const k of kpis) {
      if (k.objectiveId === id && k.attainment !== null && k.weight > 0) {
        items.push({ value: Math.min(100, k.attainment), weight: k.weight });
      }
    }
    for (const p of projects) {
      if (p.objectiveId === id && p.status !== "CANCELLED") items.push({ value: p.progress, weight: 1 });
    }
    for (const child of objectives) {
      if (child.parentId === id && child.status !== "CANCELLED" && child.weight > 0) {
        items.push({ value: compute(child.id).progress, weight: child.weight });
      }
    }

    visiting.delete(id);
    const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
    if (totalWeight === 0) return remember(id, { progress: clamp(objective.progress, 0, 100), source: "MANUAL" });
    return remember(id, {
      progress: Math.round(items.reduce((sum, i) => sum + i.value * i.weight, 0) / totalWeight),
      source: "LINKED",
    });
  };

  const remember = (id: string, value: ObjectiveProgress) => {
    result.set(id, value);
    return value;
  };

  for (const o of objectives) compute(o.id);
  return result;
}

/**
 * Ritmo de um objetivo (0-100): progresso face ao tempo já decorrido.
 * Alcançado = 100; em curso = progresso ÷ % do prazo consumido (máx. 100);
 * nos primeiros 10% do prazo ainda não é avaliado (null).
 */
export function objectivePaceScore(status: string, progress: number, elapsedPct: number | null): number | null {
  if (status === "CANCELLED") return null;
  if (status === "ACHIEVED") return 100;
  if (elapsedPct === null || elapsedPct < 10) return null;
  return round1(Math.min(100, (progress / elapsedPct) * 100));
}

export function weightedScore(items: { score: number | null; weight: number }[]): number | null {
  return weightedKpiScore(items.map((i) => ({ attainment: i.score, weight: i.weight })));
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export interface Alert {
  key: string; // estável por entidade + tipo, usado para não notificar duas vezes
  severity: AlertSeverity;
  category: "TASK" | "PROJECT" | "KPI" | "OBJECTIVE";
  entityId: string;
  title: string;
  message: string;
  ownerId?: string | null;
  ownerName?: string | null;
  dueDate?: string;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
  );
}

const SCHEDULE_LABEL = { TASK: "Tarefa", PROJECT: "Projeto", OBJECTIVE: "Objetivo" } as const;

export function scheduleAlert(
  category: "TASK" | "PROJECT" | "OBJECTIVE",
  entity: { id: string; name: string; progress: number; status: string },
  evaluation: ScheduleEvaluation,
  owner: { id: string; fullName: string } | null,
): Alert | null {
  const label = SCHEDULE_LABEL[category];
  const common = {
    category,
    entityId: entity.id,
    ownerId: owner?.id ?? null,
    ownerName: owner?.fullName ?? null,
    dueDate: evaluation.deadline.toISOString(),
  };
  const days = Math.abs(evaluation.daysRemaining);

  switch (evaluation.timing) {
    case "OVERDUE":
      return {
        ...common,
        key: `${category.toLowerCase()}-overdue:${entity.id}`,
        severity: "CRITICAL",
        title: `${label} em atraso: ${entity.name}`,
        message: `Prazo ultrapassado há ${Math.max(1, days)} dia(s), com ${entity.progress}% concluído.`,
      };
    case "DUE_SOON":
      return {
        ...common,
        key: `${category.toLowerCase()}-due-soon:${entity.id}`,
        severity: "WARNING",
        title: `${label} com prazo a terminar: ${entity.name}`,
        message:
          evaluation.daysRemaining <= 0
            ? `O prazo termina hoje e está ${entity.progress}% concluído.`
            : `Faltam ${evaluation.daysRemaining} dia(s) e está ${entity.progress}% concluído.`,
      };
    case "AT_RISK":
      return {
        ...common,
        key: `${category.toLowerCase()}-at-risk:${entity.id}`,
        severity: "WARNING",
        title: `${label} em risco: ${entity.name}`,
        message:
          entity.status === "BLOCKED" || entity.status === "ON_HOLD"
            ? `Está ${entity.status === "BLOCKED" ? "bloqueada" : "em espera"} e o prazo termina em ${evaluation.daysRemaining} dia(s).`
            : `${evaluation.elapsedPct}% do prazo consumido para apenas ${entity.progress}% de progresso.`,
      };
    default:
      return null;
  }
}

export function kpiAlert(
  kpi: KpiInput,
  evaluation: KpiEvaluation,
  owner: { id: string; fullName: string } | null,
): Alert | null {
  const common = { category: "KPI" as const, entityId: kpi.id, ownerId: owner?.id ?? null, ownerName: owner?.fullName ?? null };
  const unit = !kpi.unit ? "" : kpi.unit === "%" ? "%" : ` ${kpi.unit}`;

  if (evaluation.health === "RED" || evaluation.health === "YELLOW") {
    const critical = evaluation.health === "RED";
    return {
      ...common,
      key: `kpi-${critical ? "red" : "yellow"}:${kpi.id}:${evaluation.latestPeriod}`,
      severity: critical ? "CRITICAL" : "WARNING",
      title: `KPI ${critical ? "abaixo do mínimo" : "abaixo da meta"}: ${kpi.name}`,
      message: `${evaluation.latestPeriod}: ${evaluation.latestValue}${unit} para meta de ${kpi.target}${unit} (${evaluation.attainment}% de atingimento).`,
    };
  }
  if (evaluation.missingLastPeriod) {
    return {
      ...common,
      key: `kpi-missing:${kpi.id}:${evaluation.expectedPeriod}`,
      severity: "INFO",
      title: `KPI sem medição: ${kpi.name}`,
      message: `Falta registar o valor do período ${evaluation.expectedPeriod}.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------

function startOfDayUTC(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
