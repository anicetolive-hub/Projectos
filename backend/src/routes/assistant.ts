import { Request, Router } from "express";
import { z } from "zod";
import { env } from "../lib/env";
import { asyncHandler } from "../middleware/asyncHandler";
import { assistantEnabled, chat } from "../services/assistant/assistant";
import type { ApiCall } from "../services/assistant/executor";

export const assistantRouter = Router();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

/**
 * As ferramentas do assistente usam a própria API da aplicação com o token de
 * quem está a conversar: as mesmas validações e permissões dos menus.
 */
function apiAs(req: Request): ApiCall {
  const authorization = req.headers.authorization ?? "";
  return async (method, path, body) => {
    const response = await fetch(`http://127.0.0.1:${env.port}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (response.status === 204 ? null : await response.json().catch(() => null)) as {
      error?: string;
      details?: { fieldErrors?: unknown };
    } | null;
    if (!response.ok) {
      const details = data?.details?.fieldErrors ? ` ${JSON.stringify(data.details.fieldErrors)}` : "";
      throw new Error(`${data?.error ?? `Erro ${response.status}`}${details}`);
    }
    return data;
  };
}

assistantRouter.get("/status", (_req, res) => {
  res.json({ enabled: assistantEnabled() });
});

assistantRouter.post(
  "/chat",
  asyncHandler(async (req, res) => {
    if (!assistantEnabled()) {
      return res.status(503).json({
        error: "O assistente não está ativo neste servidor. O administrador tem de configurar ANTHROPIC_API_KEY.",
      });
    }
    const { message, conversationId } = chatSchema.parse(req.body);
    res.json(await chat(req.user!, apiAs(req), message, conversationId));
  }),
);
