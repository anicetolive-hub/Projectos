import type { Department } from "./types";

/** Ordena os departamentos em árvore (direção primeiro, áreas por baixo) com a profundidade de cada um. */
export function departmentTree(departments: Department[]): { department: Department; depth: number }[] {
  const ids = new Set(departments.map((d) => d.id));
  const result: { department: Department; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const d of departments) {
      const effectiveParent = d.parentId && ids.has(d.parentId) ? d.parentId : null;
      if (effectiveParent === parentId && !result.some((r) => r.department.id === d.id)) {
        result.push({ department: d, depth });
        visit(d.id, depth + 1);
      }
    }
  };
  visit(null, 0);
  // Departamentos presos num ciclo de hierarquia ficam no fim, sem indentação
  for (const d of departments) if (!result.some((r) => r.department.id === d.id)) result.push({ department: d, depth: 0 });
  return result;
}
