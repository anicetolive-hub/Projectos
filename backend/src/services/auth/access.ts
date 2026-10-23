// Regras de visibilidade e permissão do módulo de performance:
// - administrador: vê e gere tudo;
// - diretor/gestor/coordenador: vê e gere o seu departamento e as áreas
//   subordinadas (pessoas, tarefas, medições de KPIs, objetivos);
// - colaborador: vê e gere apenas o que é seu.

/** Dados do utilizador de que as regras precisam (compatível com AuthUser). */
export interface ScopeUser {
  id: string;
  role: string;
  departmentId: string | null;
  isAdmin: boolean;
}

export const LEADER_ROLES = new Set(["DIRECTOR", "MANAGER", "COORDINATOR"]);

export interface Scope {
  all: boolean;
  departmentIds: Set<string>;
  personIds: Set<string>;
}

export function buildScope(
  user: ScopeUser,
  departments: { id: string; parentId: string | null }[],
  people: { id: string; departmentId: string | null }[],
): Scope {
  if (user.isAdmin) {
    return { all: true, departmentIds: new Set(departments.map((d) => d.id)), personIds: new Set(people.map((p) => p.id)) };
  }

  const departmentIds = new Set<string>();
  if (LEADER_ROLES.has(user.role) && user.departmentId) {
    const queue = [user.departmentId];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (departmentIds.has(id)) continue;
      departmentIds.add(id);
      queue.push(...departments.filter((d) => d.parentId === id).map((d) => d.id));
    }
  }

  const personIds = new Set(people.filter((p) => p.departmentId && departmentIds.has(p.departmentId)).map((p) => p.id));
  personIds.add(user.id);
  return { all: false, departmentIds, personIds };
}

export function canManagePerson(scope: Scope, personId: string | null | undefined): boolean {
  if (scope.all) return true;
  return !!personId && scope.personIds.has(personId);
}

export function canManageDepartment(scope: Scope, departmentId: string | null | undefined): boolean {
  if (scope.all) return true;
  return !!departmentId && scope.departmentIds.has(departmentId);
}
