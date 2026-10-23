// "Servidor" da versão de demonstração: responde às chamadas da API dentro do
// navegador, com os dados de exemplo guardados neste aparelho. Reutiliza o
// motor de cálculo e as regras de acesso do backend; as validações e
// permissões das escritas espelham src/routes/performance.ts (versão resumida).
// Só é incluído no build de demonstração (VITE_DEMO=true).
import { buildDemoData } from "../../../backend/prisma/demoData";
import {
  buildScope,
  canManageDepartment,
  canManagePerson,
  LEADER_ROLES,
  type Scope,
} from "../../../backend/src/services/auth/access";
import { periodOf, type KpiFrequency } from "../../../backend/src/services/performance/engine";
import { buildSnapshot, isOpen } from "../../../backend/src/services/performance/snapshotCore";
import { filterSnapshot } from "../../../backend/src/services/performance/visibility";
import { ApiError } from "../api";

type Data = ReturnType<typeof buildDemoData>;
type PersonRow = Data["people"][number];

const STORE_KEY = "demo.store.v1";
const DATE_FIELDS = new Set(["startDate", "dueDate", "completedAt", "achievedAt", "createdAt", "updatedAt"]);
export const DEMO_PASSWORD = "demo";

let store: Data = load();

function load(): Data {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      return JSON.parse(raw, (key, value) =>
        DATE_FIELDS.has(key) && typeof value === "string" ? new Date(value) : value,
      ) as Data;
    }
  } catch {
    // dados guardados ilegíveis ou armazenamento indisponível: recomeça
  }
  return buildDemoData(new Date());
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // sem armazenamento: as alterações duram até fechar a página
  }
}

/** Volta aos dados de exemplo originais (com datas relativas a hoje). */
export function resetDemoData() {
  store = buildDemoData(new Date());
  save();
}

// ---------------------------------------------------------------------------

function fail(status: number, message: string): never {
  throw new ApiError(message, status, { error: message });
}

const newId = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const byName = <T>(key: (t: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));
const byDate = <T extends { dueDate: Date }>(a: T, b: T) => a.dueDate.getTime() - b.dueDate.getTime();

function publicPerson(p: PersonRow | undefined | null) {
  return p ? { ...p, hasPassword: true } : null;
}

function snapshot() {
  const person = (id: string | null) => publicPerson(store.people.find((p) => p.id === id));
  const department = (id: string | null) => store.departments.find((d) => d.id === id) ?? null;
  return buildSnapshot(
    {
      departments: [...store.departments].sort(byName((d) => d.name)),
      people: [...store.people]
        .sort(byName((p) => p.fullName))
        .map((p) => ({ ...p, hasPassword: true, department: department(p.departmentId) })),
      kpis: store.kpis
        .filter((k) => k.active)
        .sort(byName((k) => k.name))
        .map((k) => ({
          ...k,
          owner: person(k.ownerId),
          department: department(k.departmentId),
          measurements: store.measurements
            .filter((m) => m.kpiId === k.id)
            .sort((a, b) => b.period.localeCompare(a.period)),
        })),
      projects: [...store.projects]
        .sort(byDate)
        .map((p) => ({ ...p, owner: person(p.ownerId), department: department(p.departmentId) })),
      tasks: [...store.tasks].sort(byDate).map((t) => ({
        ...t,
        assignee: person(t.assigneeId),
        project: store.projects.find((p) => p.id === t.projectId) ?? null,
      })),
      objectives: [...store.objectives]
        .sort(byDate)
        .map((o) => ({ ...o, owner: person(o.ownerId), department: department(o.departmentId) })),
    },
    new Date(),
    3,
  );
}

// ---------------------------------------------------------------------------

interface Ctx {
  user: PersonRow;
  scope: Scope;
  body: Record<string, unknown>;
  params: string[];
  query: URLSearchParams;
}

type Handler = (ctx: Ctx) => unknown;

const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:id/g, "([^/]+)")}$`), handler]);

function currentUser(init?: RequestInit): PersonRow {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const id = (headers.Authorization ?? "").replace("Bearer demo:", "");
  const user = store.people.find((p) => p.id === id && p.active);
  if (!user) fail(401, "Sessão necessária. Faça login.");
  return user;
}

export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  // Pequena espera para a interface se comportar como com um servidor real
  await new Promise((r) => setTimeout(r, 80));
  const url = new URL(path, "http://demo");
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

  if (url.pathname.startsWith("/api/assistant/")) return (await handleAssistant(url.pathname, body, init)) as T;
  const result = handleAuth(url.pathname, method, body, init) ?? handleApi(url, method, body, init);
  if (result === undefined) return undefined as T;
  // Simula a serialização JSON da API (datas passam a texto ISO)
  return JSON.parse(JSON.stringify(result)) as T;
}

async function handleAssistant(pathname: string, body: Record<string, unknown>, init?: RequestInit) {
  const user = currentUser(init);
  const { demoAssistantChat, demoAssistantStatus } = await import("./mockAssistant");
  if (pathname === "/api/assistant/status") return demoAssistantStatus();
  if (pathname !== "/api/assistant/chat") fail(404, "Rota não encontrada");
  const message = String(body.message ?? "").trim();
  if (!message) fail(400, "Mensagem vazia");
  // As ferramentas do assistente chamam esta mesma API simulada, como o utilizador
  const call = (method: string, path: string, payload?: unknown) =>
    mockRequest(path, {
      method,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      headers: { Authorization: `Bearer demo:${user.id}` },
    });
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : undefined;
  return demoAssistantChat(user, call, message, conversationId);
}

function handleAuth(pathname: string, method: string, body: Record<string, unknown>, init?: RequestInit) {
  if (pathname === "/api/auth/status") return { setupRequired: false };
  if (pathname === "/api/auth/login" && method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const person = store.people.find((p) => p.email === email && p.active);
    if (!person || body.password !== DEMO_PASSWORD) fail(401, "Email ou password incorretos");
    return { token: `demo:${person.id}`, expiresAt: new Date(Date.now() + 12 * 3600_000), user: person };
  }
  if (pathname === "/api/auth/me") return currentUser(init);
  if (pathname === "/api/auth/logout") return undefined;
  if (pathname === "/api/auth/change-password") {
    currentUser(init);
    fail(400, "Na demonstração as passwords não podem ser alteradas");
  }
  return null;
}

function handleApi(url: URL, method: string, body: Record<string, unknown>, init?: RequestInit) {
  const user = currentUser(init);
  if (!url.pathname.startsWith("/api/performance/")) fail(404, "Rota não encontrada");

  const sub = url.pathname.slice("/api/performance".length);
  for (const [m, regex, handler] of routes) {
    const match = m === method && regex.exec(sub);
    if (!match) continue;
    const scope = buildScope(user, store.departments, store.people);
    const result = handler({ user, scope, body, params: match.slice(1), query: url.searchParams });
    if (method !== "GET") save();
    return result;
  }
  fail(404, "Rota não encontrada");
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

const visible = (ctx: Ctx) => filterSnapshot(snapshot(), ctx.scope);

route("GET", "/dashboard", (ctx) => {
  const snap = visible(ctx);
  const countBy = (values: string[]) =>
    values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
  const openProjects = snap.projects.filter((p) => isOpen(p.status));
  return {
    generatedAt: snap.generatedAt,
    me: snap.people.find((p) => p.id === ctx.user.id) ?? null,
    departments: snap.departments,
    leaders: snap.people
      .filter((p) => p.active && p.role !== "STAFF")
      .sort((a, b) => (b.scorecard.score ?? -1) - (a.scorecard.score ?? -1)),
    strategicObjectives: snap.objectives.filter((o) => o.level === "STRATEGIC" && o.status !== "CANCELLED"),
    kpiHealth: countBy(snap.kpis.map((k) => k.evaluation.health)),
    taskTiming: countBy(snap.tasks.filter((t) => isOpen(t.status)).map((t) => t.schedule.timing)),
    projects: {
      open: openProjects.length,
      overdue: openProjects.filter((p) => p.schedule.timing === "OVERDUE").length,
      atRisk: openProjects.filter((p) => p.schedule.timing === "AT_RISK" || p.schedule.timing === "DUE_SOON").length,
    },
    alerts: snap.alerts,
  };
});
route("GET", "/alerts", (ctx) => visible(ctx).alerts);
route("POST", "/alerts/notify", (ctx) => (requireAdmin(ctx), { sent: 0 }));
route("GET", "/departments", (ctx) => visible(ctx).departments);
route("GET", "/people", (ctx) => visible(ctx).people);
route("GET", "/kpis", (ctx) => visible(ctx).kpis);
route("GET", "/objectives", (ctx) => visible(ctx).objectives);
route("GET", "/projects", (ctx) => visible(ctx).projects);
route("GET", "/tasks", (ctx) => visible(ctx).tasks);

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------

function requireAdmin(ctx: Ctx) {
  if (!ctx.user.isAdmin) fail(403, "Apenas administradores podem fazer esta operação");
}

const isLeader = (ctx: Ctx) => LEADER_ROLES.has(ctx.user.role);
const now = () => new Date();
const toDate = (v: unknown) => (v === null || v === undefined || v === "" ? null : new Date(String(v)));

function find<T extends { id: string }>(list: T[], id: string, label: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) fail(404, `${label} não encontrado`);
  return item;
}

function remove<T extends { id: string }>(list: T[], id: string) {
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list.splice(i, 1);
}

/** Aplica só os campos enviados, convertendo datas. */
function patch<T extends object>(target: T, body: Record<string, unknown>, fields: string[]): T {
  for (const field of fields) {
    if (!(field in body)) continue;
    const value = body[field];
    (target as Record<string, unknown>)[field] = DATE_FIELDS.has(field)
      ? toDate(value)
      : typeof value === "string" && value === "" && field.endsWith("Id")
        ? null
        : value;
  }
  (target as { updatedAt?: Date }).updatedAt = now();
  return target;
}

// Departamentos e pessoas (administradores)
const DEPARTMENT_FIELDS = ["name", "code", "description", "parentId"];
route("POST", "/departments", (ctx) => {
  requireAdmin(ctx);
  const d = patch(
    { id: newId(), name: "", code: "", description: null, parentId: null, createdAt: now(), updatedAt: now() },
    ctx.body,
    DEPARTMENT_FIELDS,
  );
  d.code = d.code.toUpperCase();
  if (store.departments.some((x) => x.code === d.code)) fail(409, "Já existe um registo com este valor único");
  store.departments.push(d);
  return d;
});
route("PUT", "/departments/:id", (ctx) => {
  requireAdmin(ctx);
  if (ctx.body.parentId === ctx.params[0]) fail(400, "Um departamento não pode ser subordinado a si próprio");
  return patch(find(store.departments, ctx.params[0], "Departamento"), ctx.body, DEPARTMENT_FIELDS);
});
route("DELETE", "/departments/:id", (ctx) => {
  requireAdmin(ctx);
  const id = ctx.params[0];
  const used =
    store.people.some((p) => p.departmentId === id) ||
    store.kpis.some((k) => k.departmentId === id) ||
    store.projects.some((p) => p.departmentId === id) ||
    store.objectives.some((o) => o.departmentId === id) ||
    store.departments.some((d) => d.parentId === id);
  if (used) {
    fail(409, "Departamento possui pessoas, KPIs, projetos, objetivos ou áreas subordinadas; mova-os antes de remover");
  }
  remove(store.departments, id);
});

const PERSON_FIELDS = ["fullName", "email", "jobTitle", "role", "departmentId", "active", "isAdmin"];
route("POST", "/people", (ctx) => {
  requireAdmin(ctx);
  const p = patch(
    {
      id: newId(),
      fullName: "",
      email: "",
      jobTitle: "",
      role: "STAFF",
      departmentId: "",
      isAdmin: false,
      active: true,
      createdAt: now(),
      updatedAt: now(),
    },
    { ...ctx.body, email: String(ctx.body.email ?? "").toLowerCase() },
    PERSON_FIELDS,
  );
  store.people.push(p as PersonRow);
  return publicPerson(p as PersonRow);
});
route("PUT", "/people/:id", (ctx) => {
  requireAdmin(ctx);
  const id = ctx.params[0];
  if (id === ctx.user.id && (ctx.body.isAdmin === false || ctx.body.active === false)) {
    fail(400, "Não pode retirar o seu próprio acesso de administrador");
  }
  return publicPerson(patch(find(store.people, id, "Pessoa"), ctx.body, PERSON_FIELDS));
});
route("DELETE", "/people/:id", (ctx) => {
  requireAdmin(ctx);
  const id = ctx.params[0];
  if (id === ctx.user.id) fail(400, "Não pode remover a sua própria conta");
  for (const k of store.kpis) if (k.ownerId === id) (k as { ownerId: string | null }).ownerId = null;
  for (const p of store.projects) if (p.ownerId === id) (p as { ownerId: string | null }).ownerId = null;
  for (const t of store.tasks) if (t.assigneeId === id) (t as { assigneeId: string | null }).assigneeId = null;
  for (const o of store.objectives) if (o.ownerId === id) (o as { ownerId: string | null }).ownerId = null;
  remove(store.people, id);
});

// KPIs (administradores) e medições (responsável ou chefia)
const KPI_FIELDS = [
  "name",
  "description",
  "unit",
  "direction",
  "frequency",
  "target",
  "warningThreshold",
  "weight",
  "departmentId",
  "ownerId",
  "objectiveId",
  "active",
];
route("POST", "/kpis", (ctx) => {
  requireAdmin(ctx);
  const k = patch(
    {
      id: newId(),
      name: "",
      description: null,
      unit: null,
      direction: "HIGHER_IS_BETTER",
      frequency: "MONTHLY",
      target: 0,
      warningThreshold: 90,
      weight: 1,
      departmentId: null,
      ownerId: null,
      objectiveId: null,
      active: true,
      createdAt: now(),
      updatedAt: now(),
    },
    ctx.body,
    KPI_FIELDS,
  );
  store.kpis.push(k as unknown as Data["kpis"][number]);
  return k;
});
route("PUT", "/kpis/:id", (ctx) => (requireAdmin(ctx), patch(find(store.kpis, ctx.params[0], "KPI"), ctx.body, KPI_FIELDS)));
route("DELETE", "/kpis/:id", (ctx) => {
  requireAdmin(ctx);
  remove(store.kpis, ctx.params[0]);
  store.measurements = store.measurements.filter((m) => m.kpiId !== ctx.params[0]);
});

function assertCanMeasure(ctx: Ctx, kpi: Data["kpis"][number]) {
  if (!canManagePerson(ctx.scope, kpi.ownerId) && !(isLeader(ctx) && canManageDepartment(ctx.scope, kpi.departmentId))) {
    fail(403, "Só o responsável do KPI, a sua chefia ou um administrador podem registar valores");
  }
}
route("POST", "/kpis/:id/measurements", (ctx) => {
  const kpi = find(store.kpis, ctx.params[0], "KPI");
  assertCanMeasure(ctx, kpi);
  const period = String(ctx.body.period || periodOf(kpi.frequency as KpiFrequency, new Date()));
  const value = Number(ctx.body.value);
  if (Number.isNaN(value)) fail(400, "Valor inválido");
  const existing = store.measurements.find((m) => m.kpiId === kpi.id && m.period === period);
  if (existing) {
    existing.value = value;
    existing.updatedAt = now();
    return existing;
  }
  const m = { id: newId(), kpiId: kpi.id, period, value, notes: null, createdAt: now(), updatedAt: now() };
  store.measurements.push(m);
  return m;
});
route("DELETE", "/kpis/:id/measurements/:id", (ctx) => {
  assertCanMeasure(ctx, find(store.kpis, ctx.params[0], "KPI"));
  remove(store.measurements, ctx.params[1]);
});

// Objetivos
const OBJECTIVE_FIELDS = [
  "title",
  "description",
  "level",
  "status",
  "weight",
  "progress",
  "startDate",
  "dueDate",
  "parentId",
  "departmentId",
  "ownerId",
];
const PARENT_LEVEL: Record<string, string | null> = { STRATEGIC: null, DIRECTION: "STRATEGIC", INDIVIDUAL: "DIRECTION" };
type ObjectiveRow = Data["objectives"][number];

function assertCanManageObjective(ctx: Ctx, o: { level: string; departmentId: string | null; ownerId: string | null }) {
  if (ctx.user.isAdmin) return;
  const allowed =
    o.level === "DIRECTION"
      ? isLeader(ctx) && canManageDepartment(ctx.scope, o.departmentId)
      : o.level === "INDIVIDUAL" && canManagePerson(ctx.scope, o.ownerId);
  if (!allowed) {
    fail(
      403,
      o.level === "STRATEGIC"
        ? "Só administradores definem objetivos estratégicos"
        : o.level === "DIRECTION"
          ? "Só as chefias do departamento ou um administrador gerem objetivos de direção"
          : "Só a própria pessoa, as suas chefias ou um administrador gerem objetivos individuais",
    );
  }
}

function validateObjective(o: ObjectiveRow) {
  if (o.dueDate < o.startDate) fail(400, "O prazo deve ser igual ou posterior à data de início");
  if (o.level === "DIRECTION" && !o.departmentId) fail(400, "Um objetivo de direção precisa de um departamento");
  if (o.level === "INDIVIDUAL" && !o.ownerId) fail(400, "Um objetivo individual precisa de um responsável");
  if (o.parentId) {
    if (o.parentId === o.id) fail(400, "Um objetivo não pode contribuir para si próprio");
    const parent = find(store.objectives, o.parentId, "Objetivo superior");
    if (parent.level !== PARENT_LEVEL[o.level]) fail(400, "O objetivo superior não é do nível certo");
  }
}

route("POST", "/objectives", (ctx) => {
  const o = patch(
    {
      id: newId(),
      title: "",
      description: null,
      level: "INDIVIDUAL",
      status: "ACTIVE",
      weight: 1,
      progress: 0,
      startDate: now(),
      dueDate: now(),
      achievedAt: null,
      parentId: null,
      departmentId: null,
      ownerId: null,
      createdAt: now(),
      updatedAt: now(),
    },
    ctx.body,
    OBJECTIVE_FIELDS,
  ) as unknown as ObjectiveRow;
  assertCanManageObjective(ctx, o);
  validateObjective(o);
  store.objectives.push(o);
  return o;
});
route("PUT", "/objectives/:id", (ctx) => {
  const current = find(store.objectives, ctx.params[0], "Objetivo");
  assertCanManageObjective(ctx, current);
  const updated = patch({ ...current }, ctx.body, OBJECTIVE_FIELDS);
  assertCanManageObjective(ctx, updated);
  validateObjective(updated);
  if ("status" in ctx.body) {
    (updated as { achievedAt: Date | null }).achievedAt =
      updated.status === "ACHIEVED" ? (current.achievedAt ?? now()) : null;
  }
  Object.assign(current, updated);
  return current;
});
route("DELETE", "/objectives/:id", (ctx) => {
  const current = find(store.objectives, ctx.params[0], "Objetivo");
  assertCanManageObjective(ctx, current);
  const id = current.id;
  for (const k of store.kpis) if (k.objectiveId === id) (k as { objectiveId: string | null }).objectiveId = null;
  for (const p of store.projects) if (p.objectiveId === id) (p as { objectiveId: string | null }).objectiveId = null;
  for (const o of store.objectives) if (o.parentId === id) (o as { parentId: string | null }).parentId = null;
  remove(store.objectives, id);
});

// Projetos e tarefas
const PROJECT_FIELDS = ["name", "description", "status", "priority", "startDate", "dueDate", "ownerId", "departmentId", "objectiveId"];
const TASK_FIELDS = ["title", "description", "status", "priority", "progress", "startDate", "dueDate", "projectId", "assigneeId"];

function assertCanManageProject(ctx: Ctx, p: { ownerId: string | null; departmentId: string | null }) {
  if (ctx.user.isAdmin || p.ownerId === ctx.user.id) return;
  if (isLeader(ctx) && (canManagePerson(ctx.scope, p.ownerId) || canManageDepartment(ctx.scope, p.departmentId))) return;
  fail(403, "Só o responsável do projeto, as suas chefias ou um administrador podem alterá-lo");
}

function assertCanManageTask(ctx: Ctx, t: { assigneeId: string | null; projectId: string | null }) {
  if (ctx.user.isAdmin) return;
  if (t.assigneeId && canManagePerson(ctx.scope, t.assigneeId)) return;
  if (t.projectId && store.projects.find((p) => p.id === t.projectId)?.ownerId === ctx.user.id) return;
  fail(403, "Só o responsável da tarefa, as suas chefias, o dono do projeto ou um administrador podem alterá-la");
}

/** Data de conclusão ao passar a concluído; limpa ao reabrir. */
function completion(item: { status: string; completedAt: Date | null }, previousStatus?: string) {
  if (item.status === "DONE") item.completedAt = previousStatus === "DONE" && item.completedAt ? item.completedAt : now();
  else item.completedAt = null;
}

route("POST", "/projects", (ctx) => {
  if (!ctx.user.isAdmin && !isLeader(ctx)) fail(403, "Só chefias ou administradores criam projetos");
  const p = patch(
    {
      id: newId(),
      name: "",
      description: null,
      status: "PLANNED",
      priority: "MEDIUM",
      startDate: now(),
      dueDate: now(),
      completedAt: null as Date | null,
      ownerId: null,
      departmentId: null,
      objectiveId: null,
      createdAt: now(),
      updatedAt: now(),
    },
    ctx.body,
    PROJECT_FIELDS,
  ) as unknown as Data["projects"][number];
  assertCanManageProject(ctx, p);
  if (p.dueDate < p.startDate) fail(400, "O prazo deve ser igual ou posterior à data de início");
  completion(p);
  store.projects.push(p);
  return p;
});
route("PUT", "/projects/:id", (ctx) => {
  const current = find(store.projects, ctx.params[0], "Projeto");
  assertCanManageProject(ctx, current);
  const previousStatus = current.status;
  const updated = patch({ ...current }, ctx.body, PROJECT_FIELDS);
  assertCanManageProject(ctx, updated);
  if (updated.dueDate < updated.startDate) fail(400, "O prazo deve ser igual ou posterior à data de início");
  if ("status" in ctx.body) completion(updated, previousStatus);
  Object.assign(current, updated);
  return current;
});
route("DELETE", "/projects/:id", (ctx) => {
  const current = find(store.projects, ctx.params[0], "Projeto");
  assertCanManageProject(ctx, current);
  remove(store.projects, current.id);
  store.tasks = store.tasks.filter((t) => t.projectId !== current.id);
});

route("POST", "/tasks", (ctx) => {
  const t = patch(
    {
      id: newId(),
      title: "",
      description: null,
      status: "TODO",
      priority: "MEDIUM",
      progress: 0,
      startDate: null as Date | null,
      dueDate: now(),
      completedAt: null as Date | null,
      projectId: null,
      assigneeId: null,
      createdAt: now(),
      updatedAt: now(),
    },
    ctx.body,
    TASK_FIELDS,
  ) as unknown as Data["tasks"][number];
  assertCanManageTask(ctx, t);
  completion(t);
  if (t.status === "DONE") t.progress = 100;
  store.tasks.push(t);
  return t;
});
route("PUT", "/tasks/:id", (ctx) => {
  const current = find(store.tasks, ctx.params[0], "Tarefa");
  assertCanManageTask(ctx, current);
  const previousStatus = current.status;
  const updated = patch({ ...current }, ctx.body, TASK_FIELDS);
  assertCanManageTask(ctx, updated);
  if ("status" in ctx.body) {
    completion(updated, previousStatus);
    if (updated.status === "DONE") updated.progress = 100;
  }
  Object.assign(current, updated);
  return current;
});
route("DELETE", "/tasks/:id", (ctx) => {
  const current = find(store.tasks, ctx.params[0], "Tarefa");
  assertCanManageTask(ctx, current);
  remove(store.tasks, current.id);
});

/** Contas de exemplo para o ecrã de entrada da demonstração. */
export function demoAccounts() {
  return store.people
    .filter((p) => p.active && p.email)
    .map((p) => ({ fullName: p.fullName, email: p.email, role: p.role, isAdmin: p.isAdmin }));
}
