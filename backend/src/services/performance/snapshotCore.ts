// Cálculo dos indicadores a partir dos dados já carregados (sem acesso ao
// banco). Partilhado pela API (snapshot.ts) e pela versão de demonstração do
// frontend, que corre o mesmo cálculo no navegador.
import {
  type Alert,
  combineScores,
  computeObjectiveProgress,
  deliveryScore,
  evaluateKpi,
  evaluateSchedule,
  type Health,
  kpiAlert,
  type KpiDirection,
  type KpiFrequency,
  objectivePaceScore,
  projectProgress,
  scheduleAlert,
  scoreHealth,
  sortAlerts,
  weightedKpiScore,
  weightedScore,
} from "./engine";

interface DepartmentIn {
  id: string;
  parentId: string | null;
}
interface PersonIn {
  id: string;
  fullName: string;
  role: string;
  departmentId: string | null;
  active: boolean;
  passwordHash?: string | null;
}
interface KpiIn {
  id: string;
  name: string;
  unit: string | null;
  direction: string;
  frequency: string;
  target: number;
  warningThreshold: number;
  weight: number;
  departmentId: string | null;
  ownerId: string | null;
  objectiveId: string | null;
  measurements: { period: string; value: number }[];
}
interface ScheduledIn {
  id: string;
  status: string;
  startDate: Date | null;
  createdAt: Date;
  dueDate: Date;
}
interface ProjectIn extends ScheduledIn {
  name: string;
  completedAt: Date | null;
  ownerId: string | null;
  departmentId: string | null;
  objectiveId: string | null;
}
interface TaskIn extends ScheduledIn {
  title: string;
  progress: number;
  completedAt: Date | null;
  assigneeId: string | null;
  projectId: string | null;
}
interface ObjectiveIn extends ScheduledIn {
  title: string;
  level: string;
  weight: number;
  progress: number;
  achievedAt: Date | null;
  parentId: string | null;
  departmentId: string | null;
  ownerId: string | null;
}

export interface SnapshotInput<
  D extends DepartmentIn,
  P extends PersonIn,
  K extends KpiIn,
  Pr extends ProjectIn,
  T extends TaskIn,
  O extends ObjectiveIn,
> {
  departments: D[];
  people: P[];
  kpis: K[];
  projects: Pr[];
  tasks: T[];
  objectives: O[];
}

export interface Scorecard {
  kpiScore: number | null;
  objectiveScore: number | null;
  deliveryScore: number | null;
  score: number | null;
  health: Health;
  kpiCount: number;
  kpisRed: number;
  objectiveCount: number;
  openTasks: number;
  overdueTasks: number;
}

export function buildSnapshot<
  D extends DepartmentIn,
  P extends PersonIn,
  K extends KpiIn,
  Pr extends ProjectIn,
  T extends TaskIn,
  O extends ObjectiveIn,
>(data: SnapshotInput<D, P, K, Pr, T, O>, now: Date, dueSoonDays: number) {
  const { departments, people, kpis, projects, tasks, objectives } = data;
  const personById = new Map(people.map((p) => [p.id, p]));

  const kpiViews = kpis.map((kpi) => {
    const input = { ...kpi, direction: kpi.direction as KpiDirection, frequency: kpi.frequency as KpiFrequency };
    return { ...kpi, evaluation: evaluateKpi(input, now), input };
  });

  const taskViews = tasks.map((task) => ({ ...task, schedule: evaluateSchedule(task, now, dueSoonDays) }));

  const projectViews = projects.map((project) => {
    const projectTasks = taskViews.filter((t) => t.projectId === project.id);
    const progress = project.status === "DONE" ? 100 : projectProgress(projectTasks);
    const schedule = evaluateSchedule({ ...project, progress }, now, dueSoonDays);
    return {
      ...project,
      progress,
      schedule,
      taskCount: projectTasks.length,
      openTaskCount: projectTasks.filter((t) => isOpen(t.status)).length,
      overdueTaskCount: projectTasks.filter((t) => t.schedule.timing === "OVERDUE").length,
    };
  });

  const objectiveProgress = computeObjectiveProgress(
    objectives,
    kpiViews.map((k) => ({ objectiveId: k.objectiveId, attainment: k.evaluation.attainment, weight: k.weight })),
    projectViews,
  );
  const objectiveViews = objectives.map((o) => {
    const { progress, source } = objectiveProgress.get(o.id) as { progress: number; source: "LINKED" | "MANUAL" };
    const schedule = evaluateSchedule(
      { ...o, progress, status: o.status === "ACHIEVED" ? "DONE" : o.status, completedAt: o.achievedAt },
      now,
      dueSoonDays,
    );
    return {
      ...o,
      progress,
      manualProgress: o.progress,
      progressSource: source,
      schedule,
      paceScore: objectivePaceScore(o.status, progress, schedule.elapsedPct),
      kpiCount: kpiViews.filter((k) => k.objectiveId === o.id).length,
      projectCount: projectViews.filter((p) => p.objectiveId === o.id).length,
      childCount: objectives.filter((c) => c.parentId === o.id).length,
    };
  });

  function scorecard(kpiList: typeof kpiViews, taskList: typeof taskViews, objectiveList: typeof objectiveViews): Scorecard {
    const kpiScore = weightedKpiScore(kpiList.map((k) => ({ attainment: k.evaluation.attainment, weight: k.weight })));
    const objectiveScore = weightedScore(objectiveList.map((o) => ({ score: o.paceScore, weight: o.weight })));
    const delivery = deliveryScore(taskList, now);
    const score = combineScores({ kpi: kpiScore, objectives: objectiveScore, delivery });
    return {
      kpiScore,
      objectiveScore,
      deliveryScore: delivery,
      score,
      health: scoreHealth(score),
      kpiCount: kpiList.length,
      kpisRed: kpiList.filter((k) => k.evaluation.health === "RED").length,
      objectiveCount: objectiveList.filter((o) => o.status !== "CANCELLED").length,
      openTasks: taskList.filter((t) => isOpen(t.status)).length,
      overdueTasks: taskList.filter((t) => t.schedule.timing === "OVERDUE").length,
    };
  }

  // Nota da pessoa: KPIs e objetivos de que é responsável + entrega das suas tarefas
  const peopleViews = people.map(({ passwordHash, ...person }) => ({
    ...person,
    hasPassword: !!passwordHash,
    scorecard: scorecard(
      kpiViews.filter((k) => k.ownerId === person.id),
      taskViews.filter((t) => t.assigneeId === person.id),
      objectiveViews.filter((o) => o.ownerId === person.id),
    ),
  }));

  // Nota própria do departamento: KPIs e objetivos de direção do departamento + entrega das tarefas da equipa.
  const ownScorecards = new Map(
    departments.map((d) => {
      const memberIds = new Set(people.filter((p) => p.departmentId === d.id).map((p) => p.id));
      return [
        d.id,
        scorecard(
          kpiViews.filter((k) => k.departmentId === d.id),
          taskViews.filter((t) => t.assigneeId !== null && memberIds.has(t.assigneeId)),
          objectiveViews.filter((o) => o.departmentId === d.id && o.level !== "INDIVIDUAL"),
        ),
      ];
    }),
  );

  // Nota consolidada: média da nota própria com a consolidada de cada área subordinada.
  const consolidated = new Map<string, number | null>();
  function consolidate(id: string, visiting = new Set<string>()): number | null {
    if (consolidated.has(id)) return consolidated.get(id) ?? null;
    if (visiting.has(id)) return null; // proteção contra ciclos na hierarquia
    visiting.add(id);
    const values = [
      ownScorecards.get(id)?.score ?? null,
      ...departments.filter((d) => d.parentId === id).map((d) => consolidate(d.id, visiting)),
    ].filter((v): v is number => v !== null);
    const result = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
    consolidated.set(id, result);
    return result;
  }

  const departmentViews = departments.map((d) => {
    const consolidatedScore = consolidate(d.id);
    return {
      ...d,
      head: headOf(peopleViews.filter((p) => p.departmentId === d.id && p.active)),
      memberCount: people.filter((p) => p.departmentId === d.id && p.active).length,
      scorecard: ownScorecards.get(d.id) as Scorecard,
      consolidatedScore,
      consolidatedHealth: scoreHealth(consolidatedScore),
    };
  });

  const alerts: Alert[] = [];
  for (const task of taskViews) {
    const owner = task.assigneeId ? personById.get(task.assigneeId) ?? null : null;
    const alert = scheduleAlert("TASK", { ...task, name: task.title }, task.schedule, owner);
    if (alert) alerts.push(alert);
  }
  for (const project of projectViews) {
    const owner = project.ownerId ? personById.get(project.ownerId) ?? null : null;
    const alert = scheduleAlert("PROJECT", project, project.schedule, owner);
    if (alert) alerts.push(alert);
  }
  for (const objective of objectiveViews) {
    const owner = objective.ownerId ? personById.get(objective.ownerId) ?? null : null;
    const alert = scheduleAlert("OBJECTIVE", { ...objective, name: objective.title }, objective.schedule, owner);
    if (alert) alerts.push(alert);
  }
  for (const kpi of kpiViews) {
    const owner = kpi.ownerId ? personById.get(kpi.ownerId) ?? null : null;
    const alert = kpiAlert(kpi.input, kpi.evaluation, owner);
    if (alert) alerts.push(alert);
  }

  return {
    generatedAt: now.toISOString(),
    departments: departmentViews,
    people: peopleViews,
    kpis: kpiViews.map(({ input: _input, ...k }) => k),
    projects: projectViews,
    tasks: taskViews,
    objectives: objectiveViews,
    alerts: sortAlerts(alerts),
  };
}

const LEADERSHIP_RANK: Record<string, number> = { DIRECTOR: 0, MANAGER: 1, COORDINATOR: 2 };

/** Responsável do departamento: o membro com o cargo de liderança mais alto. */
function headOf<T extends { role: string }>(members: T[]): T | null {
  const leaders = members.filter((m) => m.role in LEADERSHIP_RANK);
  leaders.sort((a, b) => LEADERSHIP_RANK[a.role] - LEADERSHIP_RANK[b.role]);
  return leaders[0] ?? null;
}

export function isOpen(status: string): boolean {
  return status !== "DONE" && status !== "CANCELLED";
}
