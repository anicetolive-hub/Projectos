import { describe, expect, it } from "vitest";
import {
  combineScores,
  computeObjectiveProgress,
  deliveryScore,
  evaluateKpi,
  evaluateSchedule,
  kpiAlert,
  kpiAttainment,
  kpiHealth,
  lastClosedPeriod,
  objectivePaceScore,
  periodOf,
  projectProgress,
  scheduleAlert,
  scoreHealth,
  weightedKpiScore,
} from "./engine";

const now = new Date("2026-10-23T12:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("kpiAttainment", () => {
  it("calcula atingimento quando maior é melhor", () => {
    expect(kpiAttainment(95, 100, "HIGHER_IS_BETTER")).toBe(95);
  });

  it("inverte a razão quando menor é melhor", () => {
    // Meta: resolver em 4h; levou 5h → 80%
    expect(kpiAttainment(5, 4, "LOWER_IS_BETTER")).toBe(80);
    expect(kpiAttainment(0, 4, "LOWER_IS_BETTER")).toBe(120);
  });

  it("limita o atingimento a 120%", () => {
    expect(kpiAttainment(300, 100, "HIGHER_IS_BETTER")).toBe(120);
  });

  it("trata meta zero sem dividir por zero", () => {
    expect(kpiAttainment(0, 0, "HIGHER_IS_BETTER")).toBe(100);
    expect(kpiAttainment(2, 0, "LOWER_IS_BETTER")).toBe(0);
  });
});

describe("saúde", () => {
  it("classifica KPI pelo limiar de alerta", () => {
    expect(kpiHealth(100, 90)).toBe("GREEN");
    expect(kpiHealth(92, 90)).toBe("YELLOW");
    expect(kpiHealth(80, 90)).toBe("RED");
    expect(kpiHealth(null, 90)).toBe("NO_DATA");
  });

  it("classifica nota final pelas faixas", () => {
    expect(scoreHealth(95)).toBe("GREEN");
    expect(scoreHealth(75)).toBe("YELLOW");
    expect(scoreHealth(50)).toBe("RED");
  });
});

describe("períodos", () => {
  it("gera identificadores ordenáveis por frequência", () => {
    expect(periodOf("MONTHLY", now)).toBe("2026-10");
    expect(periodOf("QUARTERLY", now)).toBe("2026-Q4");
    expect(periodOf("YEARLY", now)).toBe("2026");
    expect(periodOf("WEEKLY", now)).toBe("2026-W43");
    expect(periodOf("WEEKLY", day("2021-01-01"))).toBe("2020-W53");
  });

  it("devolve o último período encerrado", () => {
    expect(lastClosedPeriod("MONTHLY", now)).toBe("2026-09");
    expect(lastClosedPeriod("QUARTERLY", now)).toBe("2026-Q3");
    expect(lastClosedPeriod("YEARLY", now)).toBe("2025");
    expect(lastClosedPeriod("WEEKLY", now)).toBe("2026-W42");
    expect(lastClosedPeriod("MONTHLY", day("2026-01-31"))).toBe("2025-12");
  });
});

describe("evaluateKpi", () => {
  const kpi = {
    id: "k1",
    name: "Disponibilidade",
    unit: "%",
    direction: "HIGHER_IS_BETTER" as const,
    frequency: "MONTHLY" as const,
    target: 99.5,
    warningThreshold: 98,
    weight: 1,
    measurements: [
      { period: "2026-08", value: 99.9 },
      { period: "2026-09", value: 97 },
    ],
  };

  it("usa a medição mais recente e calcula tendência", () => {
    const evaluation = evaluateKpi(kpi, now);
    expect(evaluation.latestPeriod).toBe("2026-09");
    expect(evaluation.health).toBe("RED");
    expect(evaluation.trend).toBe("DOWN");
    expect(evaluation.missingLastPeriod).toBe(false);
  });

  it("gera alerta crítico para KPI vermelho", () => {
    const alert = kpiAlert(kpi, evaluateKpi(kpi, now), null);
    expect(alert?.severity).toBe("CRITICAL");
    expect(alert?.key).toBe("kpi-red:k1:2026-09");
  });

  it("gera alerta informativo quando falta a medição do período", () => {
    const stale = { ...kpi, measurements: [{ period: "2026-07", value: 100 }] };
    const alert = kpiAlert(stale, evaluateKpi(stale, now), null);
    expect(alert?.severity).toBe("INFO");
    expect(alert?.message).toContain("2026-09");
  });

  it("pondera a nota de KPIs pelo peso e ignora os sem dados", () => {
    expect(
      weightedKpiScore([
        { attainment: 100, weight: 3 },
        { attainment: 60, weight: 1 },
        { attainment: null, weight: 5 },
      ]),
    ).toBe(90);
    expect(weightedKpiScore([{ attainment: null, weight: 1 }])).toBeNull();
  });
});

describe("evaluateSchedule", () => {
  const base = { status: "IN_PROGRESS", progress: 50, createdAt: day("2026-10-01"), startDate: day("2026-10-01") };

  it("considera a data de vencimento até ao fim do dia", () => {
    const result = evaluateSchedule({ ...base, dueDate: day("2026-10-23") }, now, 3);
    expect(result.timing).toBe("DUE_SOON");
    expect(result.daysRemaining).toBe(0);
  });

  it("marca tarefa em atraso", () => {
    const result = evaluateSchedule({ ...base, dueDate: day("2026-10-20") }, now, 3);
    expect(result.timing).toBe("OVERDUE");
    expect(result.daysRemaining).toBe(-3);
  });

  it("marca em risco quando o prazo consumido supera o progresso", () => {
    const result = evaluateSchedule({ ...base, progress: 20, dueDate: day("2026-11-05") }, now, 3);
    expect(result.timing).toBe("AT_RISK");
  });

  it("marca bloqueada como em risco e no prazo quando o progresso acompanha", () => {
    expect(evaluateSchedule({ ...base, status: "BLOCKED", dueDate: day("2026-11-30") }, now, 3).timing).toBe("AT_RISK");
    expect(evaluateSchedule({ ...base, progress: 60, dueDate: day("2026-11-05") }, now, 3).timing).toBe("ON_TRACK");
  });

  it("distingue entrega no prazo e com atraso", () => {
    const done = { ...base, status: "DONE", progress: 100, dueDate: day("2026-10-10") };
    expect(evaluateSchedule({ ...done, completedAt: new Date("2026-10-10T18:00:00Z") }, now, 3).timing).toBe(
      "DONE_ON_TIME",
    );
    expect(evaluateSchedule({ ...done, completedAt: day("2026-10-12") }, now, 3).timing).toBe("DONE_LATE");
  });

  it("gera alertas com a severidade adequada", () => {
    const overdue = evaluateSchedule({ ...base, dueDate: day("2026-10-20") }, now, 3);
    const alert = scheduleAlert("TASK", { id: "t1", name: "Migrar AD", progress: 50, status: "IN_PROGRESS" }, overdue, {
      id: "p1",
      fullName: "Ana",
    });
    expect(alert).toMatchObject({ severity: "CRITICAL", key: "task-overdue:t1", ownerName: "Ana" });

    const onTrack = evaluateSchedule({ ...base, progress: 90, dueDate: day("2026-12-01") }, now, 3);
    expect(scheduleAlert("TASK", { id: "t2", name: "x", progress: 90, status: "IN_PROGRESS" }, onTrack, null)).toBeNull();
  });
});

describe("pontuação", () => {
  it("calcula progresso do projeto ignorando canceladas", () => {
    expect(
      projectProgress([
        { status: "DONE", progress: 0 },
        { status: "IN_PROGRESS", progress: 50 },
        { status: "CANCELLED", progress: 0 },
      ]),
    ).toBe(75);
    expect(projectProgress([])).toBe(0);
  });

  it("calcula nota de entrega só com tarefas já avaliáveis", () => {
    const t = (status: string, dueDate: string, completedAt?: string) => ({
      status,
      progress: status === "DONE" ? 100 : 30,
      createdAt: day("2026-09-01"),
      dueDate: day(dueDate),
      completedAt: completedAt ? day(completedAt) : null,
    });
    const score = deliveryScore(
      [
        t("DONE", "2026-10-10", "2026-10-09"), // no prazo = 1
        t("DONE", "2026-10-10", "2026-10-15"), // atrasada = 0,5
        t("IN_PROGRESS", "2026-10-15"), // em atraso = 0
        t("IN_PROGRESS", "2026-11-30"), // ainda no prazo: não conta
        t("DONE", "2025-01-10", "2025-01-09"), // fora da janela: não conta
      ],
      now,
    );
    expect(score).toBe(50);
    expect(deliveryScore([], now)).toBeNull();
  });

  it("combina KPIs, objetivos e entrega com os pesos configurados", () => {
    expect(combineScores({ kpi: 100, objectives: 100, delivery: 50 })).toBe(85);
    // Sem objetivos: KPIs 0,5 e entrega 0,3 reponderados para 5/8 e 3/8
    expect(combineScores({ kpi: 100, objectives: null, delivery: 60 })).toBe(85);
    expect(combineScores({ kpi: null, objectives: null, delivery: 70 })).toBe(70);
    expect(combineScores({ kpi: null, objectives: null, delivery: null })).toBeNull();
  });
});

describe("objetivos", () => {
  const obj = (id: string, parentId: string | null, extra: Partial<{ status: string; weight: number; progress: number }> = {}) => ({
    id,
    parentId,
    status: "ACTIVE",
    weight: 1,
    progress: 0,
    ...extra,
  });

  it("calcula o progresso em cascata a partir de KPIs, projetos e filhos", () => {
    const result = computeObjectiveProgress(
      [obj("estrategico", null), obj("direcao", "estrategico", { weight: 3 }), obj("individual", "direcao", { progress: 40 }), obj("outro", "estrategico", { progress: 0 })],
      [{ objectiveId: "direcao", attainment: 110, weight: 1 }], // conta como 100
      [{ objectiveId: "direcao", progress: 60, status: "IN_PROGRESS" }],
    );
    expect(result.get("individual")).toEqual({ progress: 40, source: "MANUAL" });
    // direção: média de KPI 100, projeto 60 e filho 40 → 67
    expect(result.get("direcao")).toEqual({ progress: 67, source: "LINKED" });
    // estratégico: (67×3 + 0×1) / 4 → 50
    expect(result.get("estrategico")?.progress).toBe(50);
  });

  it("ignora filhos cancelados e trata alcançados como 100%", () => {
    const result = computeObjectiveProgress(
      [obj("pai", null), obj("a", "pai", { status: "ACHIEVED" }), obj("b", "pai", { status: "CANCELLED", progress: 0 })],
      [],
      [],
    );
    expect(result.get("pai")?.progress).toBe(100);
  });

  it("não entra em ciclo infinito com hierarquia circular", () => {
    const result = computeObjectiveProgress([obj("a", "b", { progress: 30 }), obj("b", "a", { progress: 70 })], [], []);
    expect(result.size).toBe(2);
  });

  it("avalia o ritmo face ao prazo decorrido", () => {
    expect(objectivePaceScore("ACTIVE", 30, 60)).toBe(50);
    expect(objectivePaceScore("ACTIVE", 80, 40)).toBe(100);
    expect(objectivePaceScore("ACTIVE", 0, 5)).toBeNull();
    expect(objectivePaceScore("ACHIEVED", 10, 90)).toBe(100);
    expect(objectivePaceScore("CANCELLED", 10, 90)).toBeNull();
  });
});
