// Executa as ferramentas do assistente chamando a API da aplicação através de
// `call` (com a sessão do utilizador). Sem dependências do servidor: a versão
// de demonstração do frontend usa este mesmo ficheiro com a API simulada.
// As respostas são resumidas para gastar poucos tokens.

export type ApiCall = (method: "GET" | "POST" | "PUT", path: string, body?: unknown) => Promise<unknown>;

export interface ToolOutcome {
  ok: boolean;
  /** Resultado entregue ao modelo (JSON) */
  content: string;
  /** Frase curta para mostrar no chat quando a ferramenta altera dados */
  summary?: string;
}

type Input = Record<string, unknown>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const P = "/api/performance";
const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : null);
const name = (p?: Row | null) => p?.fullName ?? null;

/** Copia só os campos com valor (para remover nulos e poupar tokens). */
function pick(o: Row): Row {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

const objective = (o: Row) =>
  pick({
    id: o.id,
    titulo: o.title,
    nivel: o.level,
    estado: o.status,
    progresso: o.progress,
    origem_progresso: o.progressSource === "LINKED" ? "calculado (KPIs/projetos/objetivos ligados)" : "manual",
    ritmo: o.paceScore,
    situacao_prazo: o.schedule?.timing,
    prazo: day(o.dueDate),
    responsavel: name(o.owner),
    responsavel_id: o.ownerId,
    departamento: o.department?.code,
    objetivo_superior_id: o.parentId,
  });

const task = (t: Row) =>
  pick({
    id: t.id,
    titulo: t.title,
    estado: t.status,
    progresso: t.progress,
    prioridade: t.priority,
    prazo: day(t.dueDate),
    situacao_prazo: t.schedule?.timing,
    dias_para_o_prazo: t.status === "DONE" || t.status === "CANCELLED" ? null : t.schedule?.daysRemaining,
    concluida_em: day(t.completedAt),
    responsavel: name(t.assignee),
    responsavel_id: t.assigneeId,
    projeto: t.project?.name,
    projeto_id: t.projectId,
  });

const project = (p: Row) =>
  pick({
    id: p.id,
    nome: p.name,
    estado: p.status,
    prioridade: p.priority,
    progresso: p.progress,
    prazo: day(p.dueDate),
    situacao_prazo: p.schedule?.timing,
    tarefas: `${p.taskCount - p.openTaskCount}/${p.taskCount} concluídas, ${p.overdueTaskCount} em atraso`,
    responsavel: name(p.owner),
    departamento: p.department?.code,
    objetivo_id: p.objectiveId,
  });

const kpi = (k: Row) =>
  pick({
    id: k.id,
    nome: k.name,
    unidade: k.unit,
    sentido: k.direction === "LOWER_IS_BETTER" ? "menor é melhor" : "maior é melhor",
    frequencia: k.frequency,
    meta: k.target,
    ultimo_valor: k.evaluation?.latestValue,
    ultimo_periodo: k.evaluation?.latestPeriod,
    atingimento_pct: k.evaluation?.attainment,
    situacao: k.evaluation?.health,
    periodo_em_falta: k.evaluation?.missingLastPeriod ? k.evaluation.expectedPeriod : null,
    responsavel: name(k.owner),
    departamento: k.department?.code,
    objetivo_id: k.objectiveId,
  });

const score = (s?: Row | null) =>
  s ? pick({ nota: s.score, kpis: s.kpiScore, objetivos: s.objectiveScore, entrega: s.deliveryScore, situacao: s.health }) : null;

const alert = (a: Row) => pick({ severidade: a.severity, tipo: a.category, titulo: a.title, detalhe: a.message, responsavel: a.ownerName });

const achievement = (a: Row) =>
  pick({
    id: a.id,
    titulo: a.title,
    tipo: a.type,
    estado: a.status,
    impacto: a.impact,
    data: day(a.date),
    autores: (a.authors ?? []).map(name).join(", "),
    departamento: a.department?.code,
    projeto: a.project?.name,
    objetivo: a.objective?.title,
    destaque: a.highlighted || null,
  });

const ACHIEVEMENT_LABEL: Record<string, string> = {
  SOLUTION: "Solução",
  IDEA: "Ideia",
  IMPROVEMENT: "Melhoria",
  RECOGNITION: "Reconhecimento",
};

const json = (v: unknown) => JSON.stringify(v);
const isOpen = (status: string) => status !== "DONE" && status !== "CANCELLED";

export async function runAssistantTool(toolName: string, input: Input, call: ApiCall, userId: string): Promise<ToolOutcome> {
  try {
    switch (toolName) {
      case "resumo_painel": {
        const d = (await call("GET", `${P}/dashboard`)) as Row;
        return {
          ok: true,
          content: json({
            a_minha_nota: score(d.me?.scorecard),
            departamentos: d.departments.map((x: Row) =>
              pick({ id: x.id, sigla: x.code, nome: x.name, nota_propria: x.scorecard?.score, nota_consolidada: x.consolidatedScore, situacao: x.consolidatedHealth, responsavel: name(x.head), kpis_criticos: x.scorecard?.kpisRed, tarefas_em_atraso: x.scorecard?.overdueTasks }),
            ),
            gestores_e_coordenadores: d.leaders.map((p: Row) => pick({ nome: p.fullName, cargo: p.role, departamento: p.department?.code, ...score(p.scorecard), tarefas_em_atraso: p.scorecard?.overdueTasks })),
            objetivos_estrategicos: d.strategicObjectives.map(objective),
            kpis_por_situacao: d.kpiHealth,
            tarefas_abertas_por_situacao: d.taskTiming,
            projetos: d.projects,
            alertas_principais: d.alerts.slice(0, 10).map(alert),
            total_alertas: d.alerts.length,
          }),
        };
      }
      case "listar_objetivos": {
        let list = (await call("GET", `${P}/objectives`)) as Row[];
        if (input.nivel) list = list.filter((o) => o.level === input.nivel);
        if (input.apenas_meus) list = list.filter((o) => o.ownerId === userId);
        return { ok: true, content: json(list.map(objective)) };
      }
      case "listar_kpis":
        return { ok: true, content: json(((await call("GET", `${P}/kpis`)) as Row[]).map(kpi)) };
      case "listar_projetos":
        return { ok: true, content: json(((await call("GET", `${P}/projects`)) as Row[]).map(project)) };
      case "listar_tarefas": {
        let list = (await call("GET", `${P}/tasks`)) as Row[];
        if (input.responsavel_id) list = list.filter((t) => t.assigneeId === input.responsavel_id);
        if (input.projeto_id) list = list.filter((t) => t.projectId === input.projeto_id);
        const filter = (input.filtro as string) ?? "abertas";
        if (filter === "minhas") list = list.filter((t) => t.assigneeId === userId && isOpen(t.status));
        if (filter === "abertas") list = list.filter((t) => isOpen(t.status));
        if (filter === "atrasadas_ou_em_risco") list = list.filter((t) => ["OVERDUE", "AT_RISK", "DUE_SOON"].includes(t.schedule?.timing));
        return { ok: true, content: json(list.map(task)) };
      }
      case "listar_alertas":
        return { ok: true, content: json(((await call("GET", `${P}/alerts`)) as Row[]).map(alert)) };
      case "listar_pessoas_e_departamentos": {
        const [people, departments] = (await Promise.all([call("GET", `${P}/people`), call("GET", `${P}/departments`)])) as [Row[], Row[]];
        return {
          ok: true,
          content: json({
            pessoas: people.map((p) => pick({ id: p.id, nome: p.fullName, cargo: p.role, funcao: p.jobTitle, departamento: p.department?.code, ativo: p.active, nota: p.scorecard?.score })),
            departamentos: departments.map((d) => pick({ id: d.id, sigla: d.code, nome: d.name, superior_id: d.parentId })),
          }),
        };
      }
      case "criar_objetivo": {
        const level = String(input.nivel);
        const created = (await call("POST", `${P}/objectives`, {
          title: input.titulo,
          description: input.descricao ?? null,
          level,
          startDate: input.inicio ?? new Date().toISOString().slice(0, 10),
          dueDate: input.prazo,
          parentId: input.objetivo_superior_id ?? null,
          departmentId: input.departamento_id ?? null,
          ownerId: input.responsavel_id ?? (level === "INDIVIDUAL" ? userId : null),
          weight: input.peso ?? 1,
        })) as Row;
        const label = { STRATEGIC: "estratégico", DIRECTION: "de direção", INDIVIDUAL: "individual" }[level] ?? "";
        return { ok: true, content: json({ criado: true, id: created.id }), summary: `Objetivo ${label} criado: ${created.title}` };
      }
      case "atualizar_objetivo": {
        const updated = (await call("PUT", `${P}/objectives/${input.id}`, pick({
          progress: input.progresso,
          status: input.estado,
          dueDate: input.prazo,
          title: input.titulo,
          ownerId: input.responsavel_id,
          parentId: input.objetivo_superior_id,
        }))) as Row;
        return { ok: true, content: json({ atualizado: true }), summary: `Objetivo atualizado: ${updated.title}` };
      }
      case "criar_tarefa": {
        const created = (await call("POST", `${P}/tasks`, {
          title: input.titulo,
          description: input.descricao ?? null,
          dueDate: input.prazo,
          startDate: input.inicio ?? null,
          assigneeId: input.responsavel_id ?? userId,
          projectId: input.projeto_id ?? null,
          priority: input.prioridade ?? "MEDIUM",
        })) as Row;
        return { ok: true, content: json({ criada: true, id: created.id }), summary: `Tarefa criada: ${created.title}` };
      }
      case "atualizar_tarefa": {
        const updated = (await call("PUT", `${P}/tasks/${input.id}`, pick({
          status: input.estado,
          progress: input.progresso,
          dueDate: input.prazo,
          assigneeId: input.responsavel_id,
          priority: input.prioridade,
        }))) as Row;
        return { ok: true, content: json({ atualizada: true }), summary: `Tarefa atualizada: ${updated.title}` };
      }
      case "criar_projeto": {
        const created = (await call("POST", `${P}/projects`, {
          name: input.nome,
          description: input.descricao ?? null,
          startDate: input.inicio,
          dueDate: input.prazo,
          ownerId: input.responsavel_id ?? userId,
          departmentId: input.departamento_id ?? null,
          objectiveId: input.objetivo_id ?? null,
          priority: input.prioridade ?? "MEDIUM",
        })) as Row;
        return { ok: true, content: json({ criado: true, id: created.id }), summary: `Projeto criado: ${created.name}` };
      }
      case "registar_valor_kpi": {
        const m = (await call("POST", `${P}/kpis/${input.kpi_id}/measurements`, pick({ value: input.valor, period: input.periodo }))) as Row;
        return { ok: true, content: json({ registado: true, periodo: m.period }), summary: `Valor de KPI registado (${m.period}): ${m.value}` };
      }
      case "listar_feitos": {
        let list = (await call("GET", `${P}/achievements`)) as Row[];
        if (input.tipo) list = list.filter((a) => a.type === input.tipo);
        if (input.estado) list = list.filter((a) => a.status === input.estado);
        return { ok: true, content: json(list.map(achievement)) };
      }
      case "registar_feito": {
        const created = (await call("POST", `${P}/achievements`, {
          title: input.titulo,
          type: input.tipo,
          description: input.descricao ?? null,
          impact: input.impacto ?? null,
          date: input.data ?? new Date().toISOString().slice(0, 10),
          authorIds: Array.isArray(input.autores_ids) && input.autores_ids.length ? input.autores_ids : [userId],
          departmentId: input.departamento_id ?? null,
          projectId: input.projeto_id ?? null,
          objectiveId: input.objetivo_id ?? null,
        })) as Row;
        return {
          ok: true,
          content: json({ registado: true, id: created.id, estado: created.status }),
          summary: `Registado no mural (${ACHIEVEMENT_LABEL[created.type] ?? "Feito"}): ${created.title}`,
        };
      }
      case "atualizar_feito": {
        const updated = (await call("PUT", `${P}/achievements/${input.id}`, pick({
          status: input.estado,
          impact: input.impacto,
          description: input.descricao,
          highlighted: input.destaque,
        }))) as Row;
        return { ok: true, content: json({ atualizado: true, estado: updated.status }), summary: `Feito atualizado: ${updated.title}` };
      }
      default:
        return { ok: false, content: `Ferramenta desconhecida: ${toolName}` };
    }
  } catch (err) {
    // Erros da API (permissão, validação) voltam ao modelo para ele explicar ou corrigir
    return { ok: false, content: err instanceof Error ? err.message : String(err) };
  }
}
