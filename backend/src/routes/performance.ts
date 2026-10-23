import { Request, Router } from "express";
import { z } from "zod";
import { toPublicPerson } from "../lib/personSelect";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/asyncHandler";
import { forbidden, requireAdmin } from "../middleware/auth";
import { buildScope, canManageDepartment, canManagePerson, LEADER_ROLES, Scope } from "../services/auth/access";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../services/auth/password";
import { notifyNewAlerts } from "../services/performance/alertNotifier";
import { periodOf } from "../services/performance/engine";
import { isOpen, loadSnapshot } from "../services/performance/snapshot";
import { filterSnapshot } from "../services/performance/visibility";

// Todas as rotas exigem login (ver index.ts). Leituras são filtradas pelo
// âmbito do utilizador; escritas verificam a permissão sobre o registo.

export const performanceRouter = Router();

const roles = z.enum(["DIRECTOR", "MANAGER", "COORDINATOR", "STAFF"]);
const priorities = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const optionalId = z.string().min(1).nullable().optional();
const optionalText = z.string().nullable().optional();

async function scopeFor(req: Request): Promise<Scope> {
  const [departments, people] = await Promise.all([
    prisma.department.findMany({ select: { id: true, parentId: true } }),
    prisma.person.findMany({ select: { id: true, departmentId: true } }),
  ]);
  return buildScope(req.user!, departments, people);
}

/** Snapshot completo filtrado pelo âmbito do utilizador autenticado. */
async function visibleSnapshot(req: Request) {
  const snap = await loadSnapshot();
  const scope = buildScope(req.user!, snap.departments, snap.people);
  return { snap: filterSnapshot(snap, scope), scope };
}

// ---------------------------------------------------------------------------
// Painel e alertas
// ---------------------------------------------------------------------------

performanceRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const { snap } = await visibleSnapshot(req);
    const leaders = snap.people.filter((p) => p.active && p.role !== "STAFF");
    const openProjects = snap.projects.filter((p) => isOpen(p.status));

    res.json({
      generatedAt: snap.generatedAt,
      me: snap.people.find((p) => p.id === req.user!.id) ?? null,
      departments: snap.departments,
      leaders: [...leaders].sort((a, b) => (b.scorecard.score ?? -1) - (a.scorecard.score ?? -1)),
      strategicObjectives: snap.objectives.filter((o) => o.level === "STRATEGIC" && o.status !== "CANCELLED"),
      kpiHealth: countBy(snap.kpis.map((k) => k.evaluation.health)),
      taskTiming: countBy(snap.tasks.filter((t) => isOpen(t.status)).map((t) => t.schedule.timing)),
      projects: {
        open: openProjects.length,
        overdue: openProjects.filter((p) => p.schedule.timing === "OVERDUE").length,
        atRisk: openProjects.filter((p) => p.schedule.timing === "AT_RISK" || p.schedule.timing === "DUE_SOON").length,
      },
      alerts: snap.alerts,
    });
  }),
);

performanceRouter.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    res.json((await visibleSnapshot(req)).snap.alerts);
  }),
);

// Dispara manualmente o envio dos alertas novos ao webhook (Teams/Slack)
performanceRouter.post(
  "/alerts/notify",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await notifyNewAlerts());
  }),
);

// ---------------------------------------------------------------------------
// Departamentos (só administradores alteram)
// ---------------------------------------------------------------------------

const departmentSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(1).max(20),
  description: optionalText,
  parentId: optionalId,
});

performanceRouter.get(
  "/departments",
  asyncHandler(async (req, res) => {
    res.json((await visibleSnapshot(req)).snap.departments);
  }),
);

performanceRouter.post(
  "/departments",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = departmentSchema.parse(req.body);
    res.status(201).json(await prisma.department.create({ data: { ...data, code: data.code.toUpperCase() } }));
  }),
);

performanceRouter.put(
  "/departments/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = departmentSchema.partial().parse(req.body);
    if (data.parentId && data.parentId === req.params.id) {
      return res.status(400).json({ error: "Um departamento não pode ser subordinado a si próprio" });
    }
    res.json(
      await prisma.department.update({
        where: { id: req.params.id },
        data: { ...data, code: data.code?.toUpperCase() },
      }),
    );
  }),
);

performanceRouter.delete(
  "/departments/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const [people, kpis, projects, objectives, children] = await Promise.all([
      prisma.person.count({ where: { departmentId: id } }),
      prisma.kpi.count({ where: { departmentId: id } }),
      prisma.project.count({ where: { departmentId: id } }),
      prisma.objective.count({ where: { departmentId: id } }),
      prisma.department.count({ where: { parentId: id } }),
    ]);
    if (people + kpis + projects + objectives + children > 0) {
      return res.status(409).json({
        error: "Departamento possui pessoas, KPIs, projetos, objetivos ou áreas subordinadas; mova-os antes de remover",
      });
    }
    await prisma.department.delete({ where: { id } });
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------------------
// Pessoas e acessos (só administradores alteram)
// ---------------------------------------------------------------------------

const personSchema = z.object({
  fullName: z.string().min(2),
  email: z
    .string()
    .email()
    .transform((e) => e.trim().toLowerCase())
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  jobTitle: optionalText,
  role: roles.default("STAFF"),
  departmentId: optionalId,
  active: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  // Password inicial ou redefinição pelo administrador
  password: z.string().min(MIN_PASSWORD_LENGTH, `A password deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`).optional(),
});

/** Troca a password em texto pelo hash a guardar. */
async function personData<T extends { password?: string }>(data: T): Promise<Omit<T, "password"> & { passwordHash?: string }> {
  const { password, ...rest } = data;
  return { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) };
}

performanceRouter.get(
  "/people",
  asyncHandler(async (req, res) => {
    res.json((await visibleSnapshot(req)).snap.people);
  }),
);

performanceRouter.post(
  "/people",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = personSchema.parse(req.body);
    if (data.password && !data.email) {
      return res.status(400).json({ error: "Para ter acesso, a pessoa precisa de um email" });
    }
    res.status(201).json(toPublicPerson(await prisma.person.create({ data: await personData(data) })));
  }),
);

performanceRouter.put(
  "/people/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = personSchema.partial().parse(req.body);
    const id = req.params.id;
    if (id === req.user!.id && (data.isAdmin === false || data.active === false)) {
      return res.status(400).json({ error: "Não pode retirar o seu próprio acesso de administrador" });
    }
    if (data.password) {
      const current = await prisma.person.findUniqueOrThrow({ where: { id } });
      if (!(data.email ?? current.email)) {
        return res.status(400).json({ error: "Para ter acesso, a pessoa precisa de um email" });
      }
    }
    const person = await prisma.person.update({ where: { id }, data: await personData(data) });
    // Password redefinida ou acesso desativado: termina as sessões abertas dessa pessoa
    if (data.password || data.active === false) {
      await prisma.session.deleteMany({ where: { personId: id, ...(id === req.user!.id ? { id: { not: req.sessionId } } : {}) } });
    }
    res.json(toPublicPerson(person));
  }),
);

performanceRouter.delete(
  "/people/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (id === req.user!.id) return res.status(400).json({ error: "Não pode remover a sua própria conta" });
    // Mantém KPIs, projetos, tarefas e objetivos, apenas sem responsável
    await prisma.$transaction([
      prisma.kpi.updateMany({ where: { ownerId: id }, data: { ownerId: null } }),
      prisma.project.updateMany({ where: { ownerId: id }, data: { ownerId: null } }),
      prisma.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } }),
      prisma.objective.updateMany({ where: { ownerId: id }, data: { ownerId: null } }),
      prisma.person.delete({ where: { id } }),
    ]);
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------------------
// KPIs (administradores definem; responsáveis e chefias registam valores)
// ---------------------------------------------------------------------------

const kpiSchema = z.object({
  name: z.string().min(2),
  description: optionalText,
  unit: optionalText,
  direction: z.enum(["HIGHER_IS_BETTER", "LOWER_IS_BETTER"]).default("HIGHER_IS_BETTER"),
  frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]).default("MONTHLY"),
  target: z.coerce.number(),
  warningThreshold: z.coerce.number().min(0).max(100).default(90),
  weight: z.coerce.number().positive().default(1),
  departmentId: optionalId,
  ownerId: optionalId,
  objectiveId: optionalId,
  active: z.boolean().optional(),
});

const measurementSchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4]|-W(0[1-9]|[1-4]\d|5[0-3]))?$/, "Período inválido (ex: 2026-10, 2026-Q4, 2026-W43, 2026)")
    .optional(),
  value: z.coerce.number(),
  notes: optionalText,
});

performanceRouter.get(
  "/kpis",
  asyncHandler(async (req, res) => {
    res.json((await visibleSnapshot(req)).snap.kpis);
  }),
);

performanceRouter.post(
  "/kpis",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = kpiSchema.parse(req.body);
    res.status(201).json(await prisma.kpi.create({ data }));
  }),
);

performanceRouter.put(
  "/kpis/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = kpiSchema.partial().parse(req.body);
    res.json(await prisma.kpi.update({ where: { id: req.params.id }, data }));
  }),
);

performanceRouter.delete(
  "/kpis/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.kpi.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

async function assertCanMeasure(req: Request, kpi: { ownerId: string | null; departmentId: string | null }) {
  const scope = await scopeFor(req);
  if (!canManagePerson(scope, kpi.ownerId) && !(LEADER_ROLES.has(req.user!.role) && canManageDepartment(scope, kpi.departmentId))) {
    throw forbidden("Só o responsável do KPI, a sua chefia ou um administrador podem registar valores");
  }
}

// Regista (ou corrige) o valor de um período; sem período usa o período atual
performanceRouter.post(
  "/kpis/:id/measurements",
  asyncHandler(async (req, res) => {
    const kpi = await prisma.kpi.findUnique({ where: { id: req.params.id } });
    if (!kpi) return res.status(404).json({ error: "KPI não encontrado" });
    await assertCanMeasure(req, kpi);

    const data = measurementSchema.parse(req.body);
    const period = data.period ?? periodOf(kpi.frequency as Parameters<typeof periodOf>[0], new Date());
    if (!matchesFrequency(period, kpi.frequency)) {
      return res.status(400).json({ error: `Período ${period} não corresponde à frequência ${kpi.frequency} do KPI` });
    }

    const measurement = await prisma.kpiMeasurement.upsert({
      where: { kpiId_period: { kpiId: kpi.id, period } },
      create: { kpiId: kpi.id, period, value: data.value, notes: data.notes },
      update: { value: data.value, notes: data.notes },
    });
    res.status(201).json(measurement);
  }),
);

performanceRouter.delete(
  "/kpis/:id/measurements/:measurementId",
  asyncHandler(async (req, res) => {
    const kpi = await prisma.kpi.findUnique({ where: { id: req.params.id } });
    if (!kpi) return res.status(404).json({ error: "KPI não encontrado" });
    await assertCanMeasure(req, kpi);
    await prisma.kpiMeasurement.delete({ where: { id: req.params.measurementId, kpiId: req.params.id } });
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------------------
// Objetivos: estratégicos (administradores), de direção (chefias do
// departamento) e individuais (a própria pessoa e as suas chefias)
// ---------------------------------------------------------------------------

const objectiveLevels = z.enum(["STRATEGIC", "DIRECTION", "INDIVIDUAL"]);
const objectiveSchema = z.object({
  title: z.string().min(2),
  description: optionalText,
  level: objectiveLevels,
  status: z.enum(["ACTIVE", "ACHIEVED", "CANCELLED"]).default("ACTIVE"),
  weight: z.coerce.number().positive().default(1),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  startDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  parentId: optionalId,
  departmentId: optionalId,
  ownerId: optionalId,
});

const PARENT_LEVEL: Record<string, string | null> = { STRATEGIC: null, DIRECTION: "STRATEGIC", INDIVIDUAL: "DIRECTION" };
const LEVEL_LABEL: Record<string, string> = { STRATEGIC: "estratégico", DIRECTION: "de direção", INDIVIDUAL: "individual" };

type ObjectiveFields = { level: string; departmentId?: string | null; ownerId?: string | null; parentId?: string | null };

async function assertCanManageObjective(req: Request, o: ObjectiveFields) {
  if (req.user!.isAdmin) return;
  const scope = await scopeFor(req);
  const leader = LEADER_ROLES.has(req.user!.role);
  const allowed =
    o.level === "DIRECTION"
      ? leader && canManageDepartment(scope, o.departmentId)
      : o.level === "INDIVIDUAL"
        ? canManagePerson(scope, o.ownerId)
        : false;
  if (!allowed) {
    throw forbidden(
      o.level === "STRATEGIC"
        ? "Só administradores definem objetivos estratégicos"
        : o.level === "DIRECTION"
          ? "Só as chefias do departamento ou um administrador gerem objetivos de direção"
          : "Só a própria pessoa, as suas chefias ou um administrador gerem objetivos individuais",
    );
  }
}

async function validateObjective(o: ObjectiveFields & { startDate: Date; dueDate: Date }, id?: string) {
  const fail = (message: string) => Object.assign(new Error(message), { status: 400 });
  if (o.dueDate < o.startDate) throw fail("O prazo deve ser igual ou posterior à data de início");
  if (o.level === "DIRECTION" && !o.departmentId) throw fail("Um objetivo de direção precisa de um departamento");
  if (o.level === "INDIVIDUAL" && !o.ownerId) throw fail("Um objetivo individual precisa de um responsável");
  if (o.parentId) {
    if (o.parentId === id) throw fail("Um objetivo não pode contribuir para si próprio");
    const parent = await prisma.objective.findUnique({ where: { id: o.parentId } });
    if (!parent) throw fail("Objetivo superior não encontrado");
    if (parent.level !== PARENT_LEVEL[o.level]) {
      throw fail(
        o.level === "STRATEGIC"
          ? "Objetivos estratégicos são o topo e não têm objetivo superior"
          : `Um objetivo ${LEVEL_LABEL[o.level]} deve contribuir para um objetivo ${LEVEL_LABEL[PARENT_LEVEL[o.level] as string]}`,
      );
    }
  }
}

performanceRouter.get(
  "/objectives",
  asyncHandler(async (req, res) => {
    res.json((await visibleSnapshot(req)).snap.objectives);
  }),
);

performanceRouter.post(
  "/objectives",
  asyncHandler(async (req, res) => {
    const data = objectiveSchema.parse(req.body);
    await assertCanManageObjective(req, data);
    await validateObjective(data);
    res.status(201).json(
      await prisma.objective.create({ data: { ...data, achievedAt: data.status === "ACHIEVED" ? new Date() : null } }),
    );
  }),
);

performanceRouter.put(
  "/objectives/:id",
  asyncHandler(async (req, res) => {
    const data = objectiveSchema.partial().parse(req.body);
    const current = await prisma.objective.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "Objetivo não encontrado" });

    const merged = { ...current, ...data };
    // Precisa de permissão sobre o objetivo atual e sobre o resultado (ex: ao mudar o responsável)
    await assertCanManageObjective(req, current);
    await assertCanManageObjective(req, merged);
    await validateObjective(merged, current.id);

    const achievedAt =
      data.status === undefined ? undefined : data.status === "ACHIEVED" ? (current.achievedAt ?? new Date()) : null;
    res.json(await prisma.objective.update({ where: { id: current.id }, data: { ...data, achievedAt } }));
  }),
);

performanceRouter.delete(
  "/objectives/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.objective.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "Objetivo não encontrado" });
    await assertCanManageObjective(req, current);
    // KPIs, projetos e objetivos filhos ficam desligados (onDelete: SetNull)
    await prisma.objective.delete({ where: { id: current.id } });
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------------------
// Projetos (chefias criam; o responsável ou um administrador alteram)
// ---------------------------------------------------------------------------

const projectSchema = z.object({
  name: z.string().min(2),
  description: optionalText,
  status: z.enum(["PLANNED", "IN_PROGRESS", "ON_HOLD", "DONE", "CANCELLED"]).default("PLANNED"),
  priority: priorities.default("MEDIUM"),
  startDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  ownerId: optionalId,
  departmentId: optionalId,
  objectiveId: optionalId,
});

async function assertCanManageProject(req: Request, project: { ownerId?: string | null; departmentId?: string | null }) {
  if (req.user!.isAdmin) return;
  const scope = await scopeFor(req);
  const leader = LEADER_ROLES.has(req.user!.role);
  if (project.ownerId === req.user!.id) return;
  if (leader && (canManagePerson(scope, project.ownerId) || canManageDepartment(scope, project.departmentId))) return;
  throw forbidden("Só o responsável do projeto, as suas chefias ou um administrador podem alterá-lo");
}

performanceRouter.get(
  "/projects",
  asyncHandler(async (req, res) => {
    res.json((await visibleSnapshot(req)).snap.projects);
  }),
);

performanceRouter.post(
  "/projects",
  asyncHandler(async (req, res) => {
    if (!req.user!.isAdmin && !LEADER_ROLES.has(req.user!.role)) throw forbidden("Só chefias ou administradores criam projetos");
    const data = projectSchema.parse(req.body);
    await assertCanManageProject(req, data);
    if (data.dueDate < data.startDate) {
      return res.status(400).json({ error: "O prazo deve ser igual ou posterior à data de início" });
    }
    res.status(201).json(await prisma.project.create({ data: { ...data, ...completion(data.status) } }));
  }),
);

performanceRouter.put(
  "/projects/:id",
  asyncHandler(async (req, res) => {
    const data = projectSchema.partial().parse(req.body);
    const current = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "Projeto não encontrado" });
    await assertCanManageProject(req, current);
    await assertCanManageProject(req, { ...current, ...data });
    if ((data.dueDate ?? current.dueDate) < (data.startDate ?? current.startDate)) {
      return res.status(400).json({ error: "O prazo deve ser igual ou posterior à data de início" });
    }
    res.json(
      await prisma.project.update({
        where: { id: req.params.id },
        data: { ...data, ...(data.status ? completion(data.status, current) : {}) },
      }),
    );
  }),
);

performanceRouter.delete(
  "/projects/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "Projeto não encontrado" });
    await assertCanManageProject(req, current);
    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------------------
// Tarefas (o responsável, as suas chefias, o dono do projeto ou um administrador)
// ---------------------------------------------------------------------------

const taskSchema = z.object({
  title: z.string().min(2),
  description: optionalText,
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]).default("TODO"),
  priority: priorities.default("MEDIUM"),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date(),
  projectId: optionalId,
  assigneeId: optionalId,
});

async function assertCanManageTask(req: Request, task: { assigneeId?: string | null; projectId?: string | null }) {
  if (req.user!.isAdmin) return;
  const scope = await scopeFor(req);
  // Tarefa sem responsável: só quem gere o projeto (ou um administrador)
  if (task.assigneeId && canManagePerson(scope, task.assigneeId)) return;
  if (task.projectId) {
    const project = await prisma.project.findUnique({ where: { id: task.projectId } });
    if (project?.ownerId === req.user!.id) return;
  }
  throw forbidden("Só o responsável da tarefa, as suas chefias, o dono do projeto ou um administrador podem alterá-la");
}

performanceRouter.get(
  "/tasks",
  asyncHandler(async (req, res) => {
    const { assigneeId, projectId } = req.query;
    const { tasks } = (await visibleSnapshot(req)).snap;
    res.json(
      tasks.filter(
        (t) =>
          (typeof assigneeId !== "string" || t.assigneeId === assigneeId) &&
          (typeof projectId !== "string" || t.projectId === projectId),
      ),
    );
  }),
);

performanceRouter.post(
  "/tasks",
  asyncHandler(async (req, res) => {
    const data = taskSchema.parse(req.body);
    await assertCanManageTask(req, data);
    res.status(201).json(await prisma.task.create({ data: { ...data, ...completion(data.status), ...doneProgress(data.status) } }));
  }),
);

performanceRouter.put(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    const data = taskSchema.partial().parse(req.body);
    const current = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "Tarefa não encontrada" });
    await assertCanManageTask(req, current);
    await assertCanManageTask(req, { ...current, ...data });
    res.json(
      await prisma.task.update({
        where: { id: req.params.id },
        data: {
          ...data,
          ...(data.status ? { ...completion(data.status, current), ...doneProgress(data.status) } : {}),
        },
      }),
    );
  }),
);

performanceRouter.delete(
  "/tasks/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "Tarefa não encontrada" });
    await assertCanManageTask(req, current);
    await prisma.task.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------------------

/** Regista a data de conclusão ao passar a DONE e limpa-a ao reabrir. */
function completion(status: string, current?: { status: string; completedAt: Date | null }) {
  if (status === "DONE") {
    return { completedAt: current?.status === "DONE" && current.completedAt ? current.completedAt : new Date() };
  }
  return { completedAt: null };
}

function doneProgress(status: string) {
  return status === "DONE" ? { progress: 100 } : {};
}

function matchesFrequency(period: string, frequency: string): boolean {
  const patterns: Record<string, RegExp> = {
    YEARLY: /^\d{4}$/,
    QUARTERLY: /^\d{4}-Q[1-4]$/,
    MONTHLY: /^\d{4}-\d{2}$/,
    WEEKLY: /^\d{4}-W\d{2}$/,
  };
  return patterns[frequency]?.test(period) ?? false;
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
}
