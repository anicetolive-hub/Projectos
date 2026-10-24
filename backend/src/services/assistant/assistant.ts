import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { env } from "../../lib/env";
import type { AuthUser } from "../../middleware/auth";
import { runAssistantTool, type ApiCall } from "./executor";
import { systemPrompt } from "./prompt";
import { ASSISTANT_TOOLS, WRITE_TOOLS } from "./tools";

// Assistente de chat: o utilizador escreve em linguagem natural ("cria um
// objetivo individual para o Carlos...", "que tarefas minhas estão atrasadas?")
// e o Claude consulta ou altera dados através das ferramentas em tools.ts.
//
// O histórico de cada conversa fica no servidor e só cresce (nunca é editado),
// tal como a API exige para reaproveitar o raciocínio entre mensagens.

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

const MAX_TOOL_ROUNDS = 10;
const CONVERSATION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES = 120;

interface Conversation {
  userId: string;
  system: string;
  messages: MessageParam[];
  updatedAt: number;
  busy: boolean;
}

const conversations = new Map<string, Conversation>();
let client: Anthropic | null = null;

export function assistantEnabled(): boolean {
  return env.assistant.enabled;
}

export interface ChatAction {
  tool: string;
  ok: boolean;
  summary: string;
}

export interface ChatReply {
  conversationId: string;
  reply: string;
  actions: ChatAction[];
  changed: boolean;
}

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

function cleanup(now: number) {
  for (const [id, c] of conversations) {
    if (now - c.updatedAt > CONVERSATION_TTL_MS) conversations.delete(id);
  }
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

export async function chat(user: AuthUser, call: ApiCall, message: string, conversationId?: string): Promise<ChatReply> {
  const now = Date.now();
  cleanup(now);

  let id = conversationId && conversations.get(conversationId)?.userId === user.id ? conversationId : undefined;
  if (!id) {
    id = randomUUID();
    conversations.set(id, { userId: user.id, system: systemPrompt(user, new Date(now), env.assistant.timeZone), messages: [], updatedAt: now, busy: false });
  }
  const conversation = conversations.get(id) as Conversation;
  if (conversation.busy) throw httpError(409, "Ainda estou a responder à mensagem anterior. Aguarde um momento.");
  if (conversation.messages.length > MAX_MESSAGES) {
    throw httpError(400, "Esta conversa ficou muito longa. Comece uma conversa nova.");
  }

  conversation.busy = true;
  conversation.updatedAt = now;
  // Se algo falhar a meio, o histórico volta ao ponto anterior a esta mensagem
  const checkpoint = conversation.messages.length;
  conversation.messages.push({ role: "user", content: message });

  const actions: ChatAction[] = [];
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await getClient().beta.messages.create({
        model: env.assistant.model,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        // Em caso de recusa por política de segurança, a API repete o pedido num modelo alternativo
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Reaproveita o prefixo (instruções + ferramentas + histórico) entre pedidos
        cache_control: { type: "ephemeral" },
        system: conversation.system,
        tools: ASSISTANT_TOOLS,
        messages: conversation.messages,
      });

      // Guarda a resposta tal como veio (incluindo blocos de raciocínio)
      conversation.messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "refusal") {
        return finish("Não posso ajudar com esse pedido.");
      }
      if (response.stop_reason === "pause_turn") continue;

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
      );
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = response.content
          .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        const truncated = response.stop_reason === "max_tokens" ? "\n\n(Resposta interrompida por ser demasiado longa.)" : "";
        return finish((text || "Feito.") + truncated);
      }

      // Executa as ferramentas pedidas e devolve todos os resultados numa só mensagem
      const results: ToolResult[] = [];
      for (const use of toolUses) {
        const outcome = await runAssistantTool(use.name, (use.input ?? {}) as Record<string, unknown>, call, user.id);
        if (WRITE_TOOLS.has(use.name)) {
          actions.push({ tool: use.name, ok: outcome.ok, summary: outcome.ok ? (outcome.summary ?? "Feito") : outcome.content });
        }
        results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.content, is_error: !outcome.ok });
      }
      conversation.messages.push({ role: "user", content: results });
    }
    return finish("Não consegui concluir o pedido em passos suficientes. Tente dividi-lo em partes mais simples.");
  } catch (err) {
    conversation.messages.length = checkpoint;
    throw toUserError(err);
  } finally {
    conversation.busy = false;
    conversation.updatedAt = Date.now();
  }

  function finish(reply: string): ChatReply {
    return { conversationId: id as string, reply, actions, changed: actions.some((a) => a.ok) };
  }
}

function toUserError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return httpError(503, "O assistente não está bem configurado (chave da API Anthropic inválida). Fale com o administrador.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return httpError(503, "O assistente está com muitos pedidos neste momento. Tente de novo dentro de um minuto.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return httpError(503, "Não foi possível contactar o serviço do assistente. Verifique a ligação à internet do servidor.");
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[assistente] erro da API Anthropic:", err.status, err.message);
    return httpError(502, "O assistente teve um erro ao responder. Tente de novo.");
  }
  return err instanceof Error ? err : new Error(String(err));
}
