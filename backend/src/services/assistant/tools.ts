import type Anthropic from "@anthropic-ai/sdk";

// Ferramentas que o assistente pode usar. Cada uma corresponde a uma chamada à
// própria API da aplicação (ver executor.ts), feita com a sessão de quem está a
// conversar: o assistente só vê e altera o que essa pessoa veria e alteraria
// pelos menus. Não há ferramentas de remoção, de propósito.

type Tool = Anthropic.Beta.Messages.BetaTool;

const id = (description: string) => ({ type: "string", description });
const date = (description: string) => ({ type: "string", description: `${description} (formato AAAA-MM-DD)` });
const priority = {
  type: "string",
  enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
  description: "Prioridade: LOW (baixa), MEDIUM (média), HIGH (alta), CRITICAL (crítica)",
};

export const ASSISTANT_TOOLS: Tool[] = [
  {
    name: "resumo_painel",
    description:
      "Resumo da performance visível para o utilizador: a sua própria nota, notas dos departamentos e dos gestores/coordenadores, contagens de KPIs críticos, tarefas e projetos em atraso, e os alertas mais importantes. Use para perguntas gerais ('como estamos?', 'quem está pior?').",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listar_objetivos",
    description:
      "Lista objetivos (estratégicos, de direção e individuais) com progresso, ritmo, prazo, situação, responsável e objetivo superior. Use também para encontrar o id de um objetivo antes de o atualizar ou de lhe ligar outro.",
    input_schema: {
      type: "object",
      properties: {
        nivel: { type: "string", enum: ["STRATEGIC", "DIRECTION", "INDIVIDUAL"], description: "Filtrar por nível" },
        apenas_meus: { type: "boolean", description: "Só os objetivos de que o utilizador é responsável" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "listar_kpis",
    description:
      "Lista KPIs com meta, último valor, atingimento, situação (GREEN/YELLOW/RED/NO_DATA), responsável e o período cujo valor falta registar.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listar_projetos",
    description: "Lista projetos com progresso, prazo, situação de prazo, responsável, departamento e objetivo ligado.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listar_tarefas",
    description: "Lista tarefas com estado, progresso, prazo, situação de prazo, responsável e projeto.",
    input_schema: {
      type: "object",
      properties: {
        filtro: {
          type: "string",
          enum: ["minhas", "abertas", "atrasadas_ou_em_risco", "todas"],
          description: "minhas = abertas do utilizador; abertas = não concluídas; atrasadas_ou_em_risco; todas",
        },
        responsavel_id: id("Só as tarefas desta pessoa"),
        projeto_id: id("Só as tarefas deste projeto"),
      },
      additionalProperties: false,
    },
  },
  {
    name: "listar_alertas",
    description: "Alertas ativos (prazos ultrapassados ou a terminar, tarefas/objetivos em risco, KPIs abaixo da meta ou sem valor).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listar_pessoas_e_departamentos",
    description:
      "Pessoas (id, nome, cargo, departamento, nota) e departamentos (id, sigla, nome, departamento superior). Use para descobrir ids quando o utilizador fala de alguém ou de um departamento pelo nome.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "criar_objetivo",
    description:
      "Cria um objetivo. STRATEGIC = da organização (só administradores; sem objetivo superior). DIRECTION = de um departamento (exige departamento_id; o superior, se houver, tem de ser STRATEGIC). INDIVIDUAL = de uma pessoa (exige responsavel_id; o superior, se houver, tem de ser DIRECTION).",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "O objetivo, em frase curta e mensurável quando possível" },
        nivel: { type: "string", enum: ["STRATEGIC", "DIRECTION", "INDIVIDUAL"] },
        prazo: date("Data limite"),
        inicio: date("Data de início; por omissão, hoje"),
        objetivo_superior_id: id("Objetivo para o qual este contribui"),
        departamento_id: id("Departamento (obrigatório em DIRECTION)"),
        responsavel_id: id("Pessoa responsável (obrigatório em INDIVIDUAL)"),
        peso: { type: "number", description: "Peso relativo na avaliação; por omissão 1" },
        descricao: { type: "string", description: "Como será medido / detalhes" },
      },
      required: ["titulo", "nivel", "prazo"],
      additionalProperties: false,
    },
  },
  {
    name: "atualizar_objetivo",
    description:
      "Atualiza um objetivo existente: progresso manual (0-100, só tem efeito se o objetivo não tiver KPIs/projetos/objetivos ligados), estado, prazo, título, responsável ou objetivo superior.",
    input_schema: {
      type: "object",
      properties: {
        id: id("Id do objetivo"),
        progresso: { type: "integer", minimum: 0, maximum: 100 },
        estado: { type: "string", enum: ["ACTIVE", "ACHIEVED", "CANCELLED"], description: "ACTIVE em curso, ACHIEVED alcançado, CANCELLED cancelado" },
        prazo: date("Novo prazo"),
        titulo: { type: "string" },
        responsavel_id: id("Novo responsável"),
        objetivo_superior_id: id("Novo objetivo superior"),
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "criar_tarefa",
    description: "Cria uma tarefa, com ou sem projeto. Sem responsável indicado, fica atribuída ao utilizador.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        prazo: date("Data limite"),
        responsavel_id: id("Pessoa responsável"),
        projeto_id: id("Projeto a que pertence"),
        prioridade: priority,
        inicio: date("Data de início"),
        descricao: { type: "string" },
      },
      required: ["titulo", "prazo"],
      additionalProperties: false,
    },
  },
  {
    name: "atualizar_tarefa",
    description:
      "Atualiza uma tarefa: estado (TODO por iniciar, IN_PROGRESS em curso, BLOCKED bloqueada, DONE concluída, CANCELLED cancelada), progresso, prazo, responsável ou prioridade.",
    input_schema: {
      type: "object",
      properties: {
        id: id("Id da tarefa"),
        estado: { type: "string", enum: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"] },
        progresso: { type: "integer", minimum: 0, maximum: 100 },
        prazo: date("Novo prazo"),
        responsavel_id: id("Novo responsável"),
        prioridade: priority,
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "criar_projeto",
    description: "Cria um projeto (só chefias ou administradores).",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        inicio: date("Data de início"),
        prazo: date("Data limite"),
        responsavel_id: id("Responsável"),
        departamento_id: id("Departamento"),
        objetivo_id: id("Objetivo para o qual contribui"),
        prioridade: priority,
        descricao: { type: "string" },
      },
      required: ["nome", "inicio", "prazo"],
      additionalProperties: false,
    },
  },
  {
    name: "registar_valor_kpi",
    description:
      "Regista (ou corrige) o valor de um KPI num período. Sem período, usa o último período encerrado que ainda falta (campo periodo_em_falta de listar_kpis) ou o período atual.",
    input_schema: {
      type: "object",
      properties: {
        kpi_id: id("Id do KPI"),
        valor: { type: "number" },
        periodo: { type: "string", description: "Ex: 2026-10 (mensal), 2026-Q4 (trimestral), 2026-W43 (semanal), 2026 (anual)" },
      },
      required: ["kpi_id", "valor"],
      additionalProperties: false,
    },
  },
  {
    name: "listar_feitos",
    description:
      "Lista os grandes feitos da direção: soluções desenvolvidas, ideias inovadoras (com o estado da ideia), melhorias de processo e reconhecimentos, com autores, departamento, impacto e data. Use para perguntas como 'que soluções entregámos este ano?' ou 'que ideias estão em avaliação?'.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["SOLUTION", "IDEA", "IMPROVEMENT", "RECOGNITION"], description: "Filtrar por tipo" },
        estado: { type: "string", enum: ["PROPOSED", "EVALUATING", "APPROVED", "IMPLEMENTED", "DISCARDED"], description: "Filtrar por estado" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "registar_feito",
    description:
      "Regista um feito no mural da direção. tipo: SOLUTION (solução desenvolvida e entregue), IDEA (ideia inovadora; fica como proposta), IMPROVEMENT (melhoria de processo), RECOGNITION (prémio/reconhecimento). Sem autores indicados, o autor é o utilizador.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        tipo: { type: "string", enum: ["SOLUTION", "IDEA", "IMPROVEMENT", "RECOGNITION"] },
        descricao: { type: "string", description: "O que é / o que resolve" },
        impacto: { type: "string", description: "Resultado ou benefício, de preferência com números (ex: '120 horas poupadas por mês')" },
        data: date("Data do feito ou da proposta; por omissão, hoje"),
        autores_ids: { type: "array", items: { type: "string" }, description: "Ids das pessoas envolvidas" },
        departamento_id: id("Departamento"),
        projeto_id: id("Projeto relacionado"),
        objetivo_id: id("Objetivo para o qual contribui"),
      },
      required: ["titulo", "tipo"],
      additionalProperties: false,
    },
  },
  {
    name: "atualizar_feito",
    description:
      "Atualiza um feito: estado da ideia (PROPOSED proposta, EVALUATING em avaliação, APPROVED aprovada, IMPLEMENTED implementada, DISCARDED posta de parte), impacto, descrição ou destaque na visão geral (só administradores).",
    input_schema: {
      type: "object",
      properties: {
        id: id("Id do feito"),
        estado: { type: "string", enum: ["PROPOSED", "EVALUATING", "APPROVED", "IMPLEMENTED", "DISCARDED"] },
        impacto: { type: "string" },
        descricao: { type: "string" },
        destaque: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

/** Ferramentas que alteram dados (o frontend recarrega as páginas depois delas). */
export const WRITE_TOOLS = new Set([
  "criar_objetivo",
  "atualizar_objetivo",
  "criar_tarefa",
  "atualizar_tarefa",
  "criar_projeto",
  "registar_valor_kpi",
  "registar_feito",
  "atualizar_feito",
]);
