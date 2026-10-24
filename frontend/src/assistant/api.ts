import { request } from "../api";

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

export const assistantApi = {
  status: () => request<{ enabled: boolean; reason?: string }>("/api/assistant/status"),
  chat: (message: string, conversationId?: string) =>
    request<ChatReply>("/api/assistant/chat", { method: "POST", body: JSON.stringify({ message, conversationId }) }),
};
