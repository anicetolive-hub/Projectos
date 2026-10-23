import { useState } from "react";
import { ApiError } from "../api";
import { ROLE_LABEL } from "../performance/labels";
import { useAuth } from "./context";

/** Nome do utilizador, troca de password e saída, no cabeçalho. */
export function AccountMenu() {
  const { user, logout, changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!user) return null;

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setMessage({ ok: true, text: "Password alterada. As outras sessões foram terminadas." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : "Erro ao alterar a password" });
    }
  }

  return (
    <div className="account">
      <button className="account-button" onClick={() => setOpen((v) => !v)}>
        <strong>{user.fullName}</strong>
        <span className="hint">
          {ROLE_LABEL[user.role]}
          {user.isAdmin ? " · Admin" : ""}
        </span>
      </button>
      {open && (
        <div className="account-panel">
          <form onSubmit={handleChange}>
            <div className="card-title">Alterar password</div>
            <input
              type="password"
              required
              placeholder="Password atual"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Nova password (mín. 8)"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <button className="btn secondary" type="submit">
              Guardar
            </button>
            {message && <p className={message.ok ? "hint" : "health-text-RED hint"}>{message.text}</p>}
          </form>
          <button className="btn danger" onClick={logout}>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
