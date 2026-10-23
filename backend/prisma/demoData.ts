// Dados de exemplo do módulo de performance: uma Direção de Sistemas de
// Informação com três áreas, os respetivos gestores/coordenadores, objetivos
// em cascata, KPIs com histórico e projetos/tarefas em várias situações de
// prazo. As datas são relativas a `now`, para os alertas aparecerem logo.
//
// Função pura (sem banco): usada pelo seed (seedPerformance.ts) e pela versão
// de demonstração do frontend, que guarda estes dados no navegador.

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildDemoData(now = new Date()) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const inDays = (n: number) => new Date(today.getTime() + n * DAY_MS);
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(today.getUTCFullYear(), 11, 31));
  const stamps = { createdAt: now, updatedAt: now };

  const department = (id: string, code: string, name: string, parentId: string | null, description: string | null = null) => ({
    id,
    code,
    name,
    description,
    parentId,
    ...stamps,
  });
  const departments = [
    department("dep-dsi", "DSI", "Direção de Sistemas de Informação", null, "Direção responsável por toda a área de SI/TI"),
    department("dep-infra", "INFRA", "Infraestrutura e Redes", "dep-dsi"),
    department("dep-dev", "DEV", "Desenvolvimento e Sistemas", "dep-dsi"),
    department("dep-sd", "SD", "Suporte ao Utilizador (Service Desk)", "dep-dsi"),
  ];

  const person = (id: string, fullName: string, email: string, jobTitle: string, role: string, departmentId: string, isAdmin = false) => ({
    id,
    fullName,
    email,
    jobTitle,
    role,
    departmentId,
    isAdmin,
    active: true,
    ...stamps,
  });
  const people = [
    person("p-diretor", "Diretor de SI", "diretor.si@exemplo.ao", "Diretor de Sistemas de Informação", "DIRECTOR", "dep-dsi", true),
    person("p-ginfra", "Gestor de Infraestrutura", "gestor.infra@exemplo.ao", "Gestor", "MANAGER", "dep-infra"),
    person("p-credes", "Coordenador de Redes", "coord.redes@exemplo.ao", "Coordenador", "COORDINATOR", "dep-infra"),
    person("p-gdev", "Gestor de Desenvolvimento", "gestor.dev@exemplo.ao", "Gestor", "MANAGER", "dep-dev"),
    person("p-csd", "Coordenador do Service Desk", "coord.sd@exemplo.ao", "Coordenador", "COORDINATOR", "dep-sd"),
    person("p-tecnico", "Técnico de Suporte", "tecnico.sd@exemplo.ao", "Técnico", "STAFF", "dep-sd"),
  ];

  // Objetivos em cascata: estratégico → direção → individual (pais antes dos filhos)
  const objective = (
    id: string,
    title: string,
    level: string,
    o: { parentId?: string; departmentId?: string; ownerId: string; progress?: number; weight?: number; dueDate?: Date },
  ) => ({
    id,
    title,
    description: null,
    level,
    status: "ACTIVE",
    weight: o.weight ?? 1,
    progress: o.progress ?? 0,
    startDate: yearStart,
    dueDate: o.dueDate ?? yearEnd,
    achievedAt: null,
    parentId: o.parentId ?? null,
    departmentId: o.departmentId ?? null,
    ownerId: o.ownerId,
    ...stamps,
  });
  const objectives = [
    objective("o-digital", "Acelerar a transformação digital da organização", "STRATEGIC", { ownerId: "p-diretor" }),
    objective("o-servico", "Garantir serviços de TI fiáveis e seguros", "STRATEGIC", { ownerId: "p-diretor" }),
    objective("o-cloud", "Migrar os sistemas core para a cloud", "DIRECTION", { parentId: "o-digital", departmentId: "dep-dev", ownerId: "p-gdev", weight: 2 }),
    objective("o-plano", "Aprovar o plano estratégico de SI 2027", "DIRECTION", { parentId: "o-digital", departmentId: "dep-dsi", ownerId: "p-diretor" }),
    objective("o-seguranca", "Reforçar a segurança perimetral", "DIRECTION", { parentId: "o-servico", departmentId: "dep-infra", ownerId: "p-ginfra", dueDate: inDays(10) }),
    objective("o-sla", "Cumprir o SLA de suporte aos utilizadores", "DIRECTION", { parentId: "o-servico", departmentId: "dep-sd", ownerId: "p-csd" }),
    objective("o-aws", "Certificação AWS Solutions Architect", "INDIVIDUAL", { parentId: "o-cloud", ownerId: "p-gdev", progress: 60 }),
    objective("o-docrede", "Documentar a arquitetura de rede e VPNs", "INDIVIDUAL", { parentId: "o-seguranca", ownerId: "p-credes", progress: 20, dueDate: inDays(20) }),
    objective("o-reabertos", "Reduzir tickets reabertos para menos de 5%", "INDIVIDUAL", { parentId: "o-sla", ownerId: "p-csd", progress: 70 }),
    objective("o-itil", "Formação ITIL Foundation", "INDIVIDUAL", { parentId: "o-sla", ownerId: "p-tecnico", progress: 100 }),
  ];

  // KPIs com as medições dos últimos meses (a última é a do mês passado)
  const months: string[] = [];
  for (let i = 4; i >= 1; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const measurements: { id: string; kpiId: string; period: string; value: number; notes: null; createdAt: Date; updatedAt: Date }[] = [];
  const kpi = (
    id: string,
    name: string,
    k: {
      unit: string;
      target: number;
      direction?: string;
      warningThreshold?: number;
      weight?: number;
      departmentId: string;
      ownerId: string;
      objectiveId?: string;
    },
    values: number[],
  ) => {
    values.forEach((value, i) => {
      const period = months[months.length - values.length + i];
      measurements.push({ id: `m-${id}-${period}`, kpiId: id, period, value, notes: null, ...stamps });
    });
    return {
      id,
      name,
      description: null,
      unit: k.unit,
      direction: k.direction ?? "HIGHER_IS_BETTER",
      frequency: "MONTHLY",
      target: k.target,
      warningThreshold: k.warningThreshold ?? 90,
      weight: k.weight ?? 1,
      departmentId: k.departmentId,
      ownerId: k.ownerId,
      objectiveId: k.objectiveId ?? null,
      active: true,
      ...stamps,
    };
  };
  const kpis = [
    kpi("k-orcamento", "Execução do orçamento de SI", { unit: "%", target: 95, departmentId: "dep-dsi", ownerId: "p-diretor" }, [80, 86, 91, 93]),
    kpi("k-projetos", "Projetos entregues no prazo", { unit: "%", target: 85, departmentId: "dep-dsi", ownerId: "p-diretor", weight: 2, objectiveId: "o-plano" }, [70, 75, 78, 72]),
    kpi("k-disponibilidade", "Disponibilidade dos sistemas críticos", { unit: "%", target: 99.5, warningThreshold: 99, departmentId: "dep-infra", ownerId: "p-ginfra", weight: 2, objectiveId: "o-servico" }, [99.8, 99.9, 99.2, 99.7]),
    kpi("k-incidentes", "Incidentes de segurança graves", { unit: "incidentes", target: 0, direction: "LOWER_IS_BETTER", departmentId: "dep-infra", ownerId: "p-ginfra", objectiveId: "o-seguranca" }, [0, 1, 0, 0]),
    kpi("k-wan", "Uptime da rede WAN", { unit: "%", target: 99.9, warningThreshold: 99, departmentId: "dep-infra", ownerId: "p-credes" }, [99.95, 99.4, 98.7]),
    kpi("k-sprint", "Entregas de sprint cumpridas", { unit: "%", target: 90, departmentId: "dep-dev", ownerId: "p-gdev" }, [88, 92, 95]),
    kpi("k-bugs", "Bugs críticos em produção", { unit: "bugs", target: 2, direction: "LOWER_IS_BETTER", departmentId: "dep-dev", ownerId: "p-gdev" }, [3, 2, 4]),
    kpi("k-sla", "Tickets resolvidos dentro do SLA", { unit: "%", target: 90, departmentId: "dep-sd", ownerId: "p-csd", weight: 2, objectiveId: "o-sla" }, [84, 87, 91, 89]),
    kpi("k-resolucao", "Tempo médio de resolução", { unit: "h", target: 8, direction: "LOWER_IS_BETTER", departmentId: "dep-sd", ownerId: "p-csd", objectiveId: "o-sla" }, [10, 9, 7.5, 8.2]),
    kpi("k-satisfacao", "Satisfação dos utilizadores", { unit: "/5", target: 4.2, departmentId: "dep-sd", ownerId: "p-csd" }, [4.0, 4.3]),
  ];

  const project = (
    id: string,
    name: string,
    p: { priority: string; start: number; due: number; ownerId: string; departmentId: string; objectiveId: string },
  ) => ({
    id,
    name,
    description: null,
    status: "IN_PROGRESS",
    priority: p.priority,
    startDate: inDays(p.start),
    dueDate: inDays(p.due),
    completedAt: null,
    ownerId: p.ownerId,
    departmentId: p.departmentId,
    objectiveId: p.objectiveId,
    ...stamps,
  });
  const projects = [
    project("pr-erp", "Migração do ERP para a cloud", { priority: "HIGH", start: -60, due: 30, ownerId: "p-gdev", departmentId: "dep-dev", objectiveId: "o-cloud" }),
    project("pr-firewall", "Renovação dos firewalls", { priority: "CRITICAL", start: -45, due: -2, ownerId: "p-ginfra", departmentId: "dep-infra", objectiveId: "o-seguranca" }),
    project("pr-plano", "Plano estratégico de SI 2027", { priority: "HIGH", start: -20, due: 40, ownerId: "p-diretor", departmentId: "dep-dsi", objectiveId: "o-plano" }),
  ];

  const task = (
    id: string,
    title: string,
    t: {
      assigneeId: string;
      due: number;
      start?: number;
      projectId?: string;
      status?: string;
      progress?: number;
      priority?: string;
      completed?: number;
    },
  ) => ({
    id,
    title,
    description: null,
    status: t.status ?? "TODO",
    priority: t.priority ?? "MEDIUM",
    progress: t.progress ?? (t.status === "DONE" ? 100 : 0),
    startDate: t.start === undefined ? null : inDays(t.start),
    dueDate: inDays(t.due),
    completedAt: t.completed === undefined ? null : inDays(t.completed),
    projectId: t.projectId ?? null,
    assigneeId: t.assigneeId,
    ...stamps,
  });
  const tasks = [
    task("t-levantamento", "Levantamento dos módulos a migrar", { projectId: "pr-erp", assigneeId: "p-gdev", start: -60, due: -40, status: "DONE", completed: -41 }),
    task("t-testes", "Ambiente de testes na cloud", { projectId: "pr-erp", assigneeId: "p-gdev", start: -40, due: -10, status: "DONE", completed: -6 }),
    task("t-dados", "Migração de dados históricos", { projectId: "pr-erp", assigneeId: "p-gdev", start: -10, due: 4, status: "IN_PROGRESS", progress: 25, priority: "HIGH" }),
    task("t-formacao", "Formação dos utilizadores-chave", { projectId: "pr-erp", assigneeId: "p-csd", start: 5, due: 25 }),
    task("t-aquisicao", "Aquisição dos equipamentos", { projectId: "pr-firewall", assigneeId: "p-ginfra", start: -45, due: -30, status: "DONE", completed: -31 }),
    task("t-regras", "Configuração das regras e VPNs", { projectId: "pr-firewall", assigneeId: "p-credes", start: -30, due: -5, status: "IN_PROGRESS", progress: 60, priority: "CRITICAL" }),
    task("t-janela", "Janela de substituição em produção", { projectId: "pr-firewall", assigneeId: "p-credes", start: -5, due: -2, status: "BLOCKED", priority: "CRITICAL" }),
    task("t-diagnostico", "Diagnóstico da maturidade de SI", { projectId: "pr-plano", assigneeId: "p-diretor", start: -20, due: -3, status: "DONE", completed: -4 }),
    task("t-workshops", "Workshops com as áreas de negócio", { projectId: "pr-plano", assigneeId: "p-diretor", start: -3, due: 2, status: "IN_PROGRESS", progress: 50 }),
    task("t-orcamento", "Proposta de orçamento 2027", { projectId: "pr-plano", assigneeId: "p-diretor", start: 0, due: 20 }),
    // Tarefas avulsas (sem projeto)
    task("t-avaliacao", "Avaliação de desempenho semestral dos coordenadores", { assigneeId: "p-diretor", due: 10, priority: "HIGH" }),
    task("t-ceo", "Reunião de acompanhamento com o CEO", { assigneeId: "p-diretor", due: -1, priority: "HIGH" }),
    task("t-base", "Atualizar base de conhecimento do Service Desk", { assigneeId: "p-tecnico", start: -30, due: 15, status: "IN_PROGRESS", progress: 20 }),
    task("t-relatorio", "Relatório mensal de SLA", { assigneeId: "p-csd", due: -15, status: "DONE", completed: -16 }),
  ];

  return { departments, people, objectives, kpis, measurements, projects, tasks };
}

export type DemoData = ReturnType<typeof buildDemoData>;
