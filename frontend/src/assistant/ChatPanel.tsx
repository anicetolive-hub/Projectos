import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api";
import { notifyDataChanged } from "../performance/hooks";
import { assistantApi, type ChatAction } from "./api";
import { Markdown } from "./Markdown";

interface Entry {
  role: "user" | "assistant" | "error";
  text: string;
  actions?: ChatAction[];
}

const SUGGESTIONS = [
  "Que tarefas minhas estão atrasadas?",
  "Como está a performance dos coordenadores?",
  "Quais os KPIs críticos este mês?",
  "Cria um objetivo individual para mim: concluir a certificação ITIL até março",
];

/** Assistente de chat: consulta e regista informação escrevendo em linguagem natural. */
export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && enabled === null) {
      assistantApi
        .status()
        .then((s) => {
          setEnabled(s.enabled);
          setDisabledReason(s.reason ?? null);
        })
        .catch(() => setEnabled(false));
    }
    if (open) inputRef.current?.focus();
  }, [open, enabled]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setEntries((e) => [...e, { role: "user", text: message }]);
    setBusy(true);
    try {
      const reply = await assistantApi.chat(message, conversationId);
      setConversationId(reply.conversationId);
      setEntries((e) => [...e, { role: "assistant", text: reply.reply, actions: reply.actions }]);
      if (reply.changed) {
        // Atualiza contadores de alertas e a página aberta
        notifyDataChanged();
        window.dispatchEvent(new Event("perf-reload-pages"));
      }
    } catch (err) {
      setEntries((e) => [...e, { role: "error", text: err instanceof ApiError ? err.message : "Não foi possível obter resposta." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function newConversation() {
    setEntries([]);
    setConversationId(undefined);
    setInput("");
  }

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Abrir assistente">
        💬 <span>Assistente</span>
      </button>
    );
  }

  return (
    <section className="chat-panel" aria-label="Assistente">
      <header className="chat-header">
        <strong>Assistente</strong>
        <div className="actions">
          {entries.length > 0 && (
            <button className="btn secondary" onClick={newConversation} disabled={busy}>
              Nova conversa
            </button>
          )}
          <button className="btn secondary" onClick={() => setOpen(false)} aria-label="Fechar assistente">
            ✕
          </button>
        </div>
      </header>

      <div className="chat-messages" ref={listRef}>
        {enabled === false && (
          <div className="error-banner">
            {disabledReason ??
              "O assistente não está ativo neste servidor. O administrador tem de configurar a chave da API Anthropic (ANTHROPIC_API_KEY)."}
          </div>
        )}
        {entries.length === 0 && enabled !== false && (
          <div className="chat-intro">
            <p>
              Escreva o que precisa: consultar a situação de objetivos, KPIs, projetos e tarefas, ou registar informação
              sem ir aos menus.
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chat-suggestion" onClick={() => send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {entries.map((entry, i) => (
          <div key={i} className={`chat-bubble ${entry.role}`}>
            {entry.role === "assistant" ? <Markdown text={entry.text} /> : <p>{entry.text}</p>}
            {entry.actions && entry.actions.length > 0 && (
              <ul className="chat-actions">
                {entry.actions.map((a, j) => (
                  <li key={j} className={a.ok ? "ok" : "failed"}>
                    {a.ok ? "✔" : "✕"} {a.summary}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {busy && <div className="chat-bubble assistant pending">A consultar…</div>}
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          ref={inputRef}
          id="chat-message"
          rows={2}
          placeholder="Ex: cria uma tarefa para o Gestor de Redes rever as VPNs até sexta"
          value={input}
          disabled={enabled === false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button className="btn" type="submit" disabled={busy || !input.trim() || enabled === false}>
          Enviar
        </button>
      </form>
    </section>
  );
}
