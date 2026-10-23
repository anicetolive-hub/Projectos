import type { Scope } from "../auth/access";

// Recorte do snapshot que cada utilizador pode ver (ver regras em access.ts).
// Sem dependências do banco: usado também pela demonstração no navegador.

interface VisibleSnapshot {
  departments: { id: string }[];
  people: { id: string }[];
  kpis: { ownerId: string | null; departmentId: string | null }[];
  projects: { id: string; ownerId: string | null; departmentId: string | null }[];
  tasks: { assigneeId: string | null; projectId: string | null }[];
  objectives: { id: string; level: string; parentId: string | null; ownerId: string | null; departmentId: string | null }[];
  alerts: { ownerId?: string | null }[];
}

export function filterSnapshot<S extends VisibleSnapshot>(snap: S, scope: Scope): S {
  if (scope.all) return snap;

  const seesPerson = (id: string | null | undefined) => !!id && scope.personIds.has(id);
  const seesDepartment = (id: string | null | undefined) => !!id && scope.departmentIds.has(id);

  // Projetos do âmbito mostram todas as tarefas; nos restantes projetos onde a
  // pessoa tem tarefas, vê o projeto mas só as tarefas do seu âmbito.
  const managedProjectIds = new Set(
    snap.projects.filter((p) => seesPerson(p.ownerId) || seesDepartment(p.departmentId)).map((p) => p.id),
  );
  const tasks = snap.tasks.filter(
    (t) => seesPerson(t.assigneeId) || (t.projectId !== null && managedProjectIds.has(t.projectId)),
  );
  const projectIds = new Set([...managedProjectIds, ...tasks.map((t) => t.projectId).filter((id): id is string => !!id)]);

  // Objetivos estratégicos são públicos para toda a organização; os de direção e
  // individuais seguem o âmbito, mais os "pais" dos visíveis (para ver o alinhamento).
  const objectiveIds = new Set(
    snap.objectives
      .filter((o) => o.level === "STRATEGIC" || seesPerson(o.ownerId) || seesDepartment(o.departmentId))
      .map((o) => o.id),
  );
  const byId = new Map(snap.objectives.map((o) => [o.id, o]));
  for (const id of [...objectiveIds]) {
    let parentId = byId.get(id)?.parentId;
    while (parentId && !objectiveIds.has(parentId)) {
      objectiveIds.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }

  return {
    ...snap,
    departments: snap.departments.filter((d) => seesDepartment(d.id)),
    people: snap.people.filter((p) => seesPerson(p.id)),
    kpis: snap.kpis.filter((k) => seesPerson(k.ownerId) || seesDepartment(k.departmentId)),
    projects: snap.projects.filter((p) => projectIds.has(p.id)),
    tasks,
    objectives: snap.objectives.filter((o) => objectiveIds.has(o.id)),
    alerts: snap.alerts.filter((a) => seesPerson(a.ownerId)),
  };
}
