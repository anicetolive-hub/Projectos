// Assistente na demonstração: em vez do servidor, usa o Claude através da
// página publicada no claude.ai (capacidade "sample", na conta de quem a vê).
// As ferramentas e as instruções são as mesmas do backend; as ferramentas
// correm aqui na página, contra a API simulada (mockApi.ts).
import { runAssistantTool, type ApiCall } from "../../../backend/src/services/assistant/executor";
import { systemPrompt } from "../../../backend/src/services/assistant/prompt";
import { ASSISTANT_TOOLS, WRITE_TOOLS } from "../../../backend/src/services/assistant/tools";
import { ApiError } from "../api";

// Tipos mínimos do runtime de artefactos do claude.ai (só o que é usado aqui)
interface SampleTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute(input: Record<string, unknown>): unknown;
}
interface SampleOptions {
  tools?: SampleTool[];
  cache?: false;
  modelTier?: "default" | "complex" | "quick";
}
type Sample = ((input: { role: "user" | "assistant"; content: string }[], options?: SampleOptions) => Promise<{ text: string; truncated: boolean }>) & {
  limits(): Promise<{ tools?: { maxCount: number } }>;
};
type ClaudeRuntime = { use(name: "sample"): Promise<Sample | null> };

interface DemoUser {
  id: string;
  fullName: string;
  role: string;
  isAdmin: boolean;
}

const MAX_TURNS = 20;
const conversations = new Map<string, { role: "user" | "assistant"; content: string }[]>();
let samplePromise: Promise<Sample | null> | null = null;

function getSample(): Promise<Sample | null> {
  samplePromise ??= (async () => {
    const runtime = (window as unknown as { claude?: ClaudeRuntime }).claude;
    if (!runtime?.use) return null;
    const sample = await runtime.use("sample");
    if (!sample) return null;
    const limits = await sample.limits().catch(() => null);
    return limits?.tools ? sample : null;
  })();
  return samplePromise;
}

export async function demoAssistantStatus() {
  const sample = await getSample();
  return sample
    ? { enabled: true }
    : {
        enabled: false,
        reason:
          "Na demonstração, o assistente só funciona com a página aberta no claude.ai (usa a sua conta Claude). Na versão instalada funciona no servidor.",
      };
}

const SAMPLE_ERRORS: Record<string, string> = {
  not_granted: "Não autorizou esta página a usar o Claude. Recarregue a página para voltar a ser perguntado.",
  rate_limited: "Muitos pedidos seguidos ou limite de utilização atingido. Tente de novo daqui a pouco.",
  refused: "O Claude não aceitou este pedido. Reformule-o.",
  sampling_disabled: "O Claude não está disponível para esta conta.",
  tools_unavailable: "Esta aplicação do Claude não permite ferramentas na página. Experimente no navegador.",
  session_expired: "A sessão do claude.ai expirou. Entre de novo.",
  prompt_too_large: "A conversa ficou longa demais. Comece uma conversa nova.",
};

export async function demoAssistantChat(user: DemoUser, call: ApiCall, message: string, conversationId?: string) {
  const sample = await getSample();
  if (!sample) throw new ApiError((await demoAssistantStatus()).reason ?? "Assistente indisponível", 503);

  const id = conversationId && conversations.has(conversationId) ? conversationId : crypto.randomUUID();
  const turns = conversations.get(id) ?? [];
  const actions: { tool: string; ok: boolean; summary: string }[] = [];

  // Cada ferramenta executa a mesma lógica do servidor; um erro é lançado para o Claude o ler
  const tools: SampleTool[] = ASSISTANT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description ?? tool.name,
    inputSchema: tool.input_schema as Record<string, unknown>,
    execute: async (input) => {
      const outcome = await runAssistantTool(tool.name, input ?? {}, call, user.id);
      if (WRITE_TOOLS.has(tool.name)) {
        actions.push({ tool: tool.name, ok: outcome.ok, summary: outcome.ok ? (outcome.summary ?? "Feito") : outcome.content });
      }
      if (!outcome.ok) throw new Error(outcome.content);
      return outcome.content;
    },
  }));

  const instructions = systemPrompt(user, new Date(), "Africa/Luanda");
  const input = [{ role: "user" as const, content: instructions }, ...turns.slice(-MAX_TURNS), { role: "user" as const, content: message }];

  try {
    const { text, truncated } = await sample(input, { tools, cache: false, modelTier: "default" });
    const reply = text.trim() + (truncated ? "\n\n(Resposta interrompida por ser demasiado longa.)" : "");
    turns.push({ role: "user", content: message }, { role: "assistant", content: reply });
    conversations.set(id, turns);
    return { conversationId: id, reply, actions, changed: actions.some((a) => a.ok) };
  } catch (err) {
    const code = (err as { code?: string }).code ?? "upstream_error";
    const done = actions.filter((a) => a.ok).length;
    const note = done > 0 ? ` (${done} alteração(ões) já ficaram feitas.)` : "";
    throw new ApiError((SAMPLE_ERRORS[code] ?? "O assistente teve um erro ao responder. Tente de novo.") + note, 502);
  }
}
