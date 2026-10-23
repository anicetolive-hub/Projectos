import { env } from "../../lib/env";
import { PERSON_PUBLIC } from "../../lib/personSelect";
import { prisma } from "../../lib/prisma";
import { buildSnapshot } from "./snapshotCore";

export { isOpen } from "./snapshotCore";
export type { Scorecard } from "./snapshotCore";

/**
 * Carrega todo o módulo de performance de uma vez e calcula os indicadores em
 * memória. Para a dimensão de uma direção (dezenas de pessoas, centenas de
 * tarefas) isto é simples e rápido; evita espalhar a lógica por várias queries.
 */
export async function loadSnapshot(now = new Date()) {
  const ownerSelect = { select: PERSON_PUBLIC };
  const [departments, people, kpis, projects, tasks, objectives] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.person.findMany({
      orderBy: { fullName: "asc" },
      select: { ...PERSON_PUBLIC, passwordHash: true, department: true },
    }),
    prisma.kpi.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { measurements: { orderBy: { period: "desc" } }, owner: ownerSelect, department: true },
    }),
    prisma.project.findMany({ orderBy: { dueDate: "asc" }, include: { owner: ownerSelect, department: true } }),
    prisma.task.findMany({ orderBy: { dueDate: "asc" }, include: { assignee: ownerSelect, project: true } }),
    prisma.objective.findMany({ orderBy: { dueDate: "asc" }, include: { owner: ownerSelect, department: true } }),
  ]);

  return buildSnapshot({ departments, people, kpis, projects, tasks, objectives }, now, env.performance.dueSoonDays);
}

export type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;
