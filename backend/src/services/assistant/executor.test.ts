import { describe, expect, it } from "vitest";
import { runAssistantTool, type ApiCall } from "./executor";
import { ASSISTANT_TOOLS, WRITE_TOOLS } from "./tools";

function fakeApi(responses: Record<string, unknown>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const call: ApiCall = async (method, path, body) => {
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    if (!(key in responses)) throw new Error("Só administradores definem objetivos estratégicos");
    return responses[key];
  };
  return { call, calls };
}

describe("ferramentas do assistente", () => {
  it("tem nomes únicos e marca como escrita só as que alteram dados", () => {
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of WRITE_TOOLS) expect(names).toContain(name);
    expect(WRITE_TOOLS.has("listar_tarefas")).toBe(false);
  });

  it("cria objetivo individual com o utilizador como responsável por omissão", async () => {
    const { call, calls } = fakeApi({ "POST /api/performance/objectives": { id: "o1", title: "ITIL 4" } });
    const outcome = await runAssistantTool("criar_objetivo", { titulo: "ITIL 4", nivel: "INDIVIDUAL", prazo: "2027-03-31" }, call, "u1");
    expect(outcome).toMatchObject({ ok: true, summary: "Objetivo individual criado: ITIL 4" });
    expect(calls[0].body).toMatchObject({ title: "ITIL 4", level: "INDIVIDUAL", dueDate: "2027-03-31", ownerId: "u1", parentId: null });
  });

  it("devolve o erro da API ao modelo em vez de falhar", async () => {
    const { call } = fakeApi({});
    const outcome = await runAssistantTool("criar_objetivo", { titulo: "X", nivel: "STRATEGIC", prazo: "2026-12-31" }, call, "u1");
    expect(outcome).toEqual({ ok: false, content: "Só administradores definem objetivos estratégicos" });
  });

  it("filtra as tarefas do utilizador e resume os campos", async () => {
    const task = (id: string, assigneeId: string, status: string) => ({
      id,
      title: id,
      status,
      progress: 0,
      priority: "MEDIUM",
      dueDate: "2026-10-30T00:00:00.000Z",
      assigneeId,
      assignee: { fullName: assigneeId },
      schedule: { timing: "ON_TRACK", daysRemaining: 7 },
    });
    const { call } = fakeApi({
      "GET /api/performance/tasks": [task("a", "u1", "TODO"), task("b", "u2", "TODO"), task("c", "u1", "DONE")],
    });
    const outcome = await runAssistantTool("listar_tarefas", { filtro: "minhas" }, call, "u1");
    const list = JSON.parse(outcome.content);
    expect(list.map((t: { id: string }) => t.id)).toEqual(["a"]);
    expect(list[0]).toMatchObject({ prazo: "2026-10-30", responsavel: "u1", dias_para_o_prazo: 7 });
  });

  it("só envia na atualização os campos indicados", async () => {
    const { call, calls } = fakeApi({ "PUT /api/performance/tasks/t1": { id: "t1", title: "Rever VPNs" } });
    await runAssistantTool("atualizar_tarefa", { id: "t1", estado: "DONE" }, call, "u1");
    expect(calls[0].body).toEqual({ status: "DONE" });
  });
});
