import { useEffect, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/context";
import { ROLE_LABEL } from "../performance/labels";
import type { Role } from "../performance/types";

interface Account {
  fullName: string;
  email: string;
  role: string;
  isAdmin: boolean;
}

/** Entrada da demonstração: escolhe-se uma pessoa de exemplo para ver a aplicação com o seu perfil. */
export function DemoLogin() {
  const { login } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    import("./mockApi").then(({ demoAccounts }) => setAccounts(demoAccounts()));
  }, []);

  async function enter(email: string) {
    setBusy(email);
    setError(null);
    try {
      const { DEMO_PASSWORD } = await import("./mockApi");
      await login(email, DEMO_PASSWORD);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao entrar");
      setBusy(null);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Tarefas e Projectos</h1>
        <p className="hint" style={{ marginTop: 0 }}>
          Demonstração com dados de exemplo de uma Direção de Sistemas de Informação. Escolha com quem quer entrar: cada
          perfil vê e pode alterar coisas diferentes.
        </p>
        {error && <div className="error-banner">{error}</div>}
        <div className="demo-accounts">
          {accounts.map((a) => (
            <button key={a.email} className="demo-account" onClick={() => enter(a.email)} disabled={busy !== null}>
              <strong>{a.fullName}</strong>
              <span className="hint">
                {ROLE_LABEL[a.role as Role]}
                {a.isAdmin ? " · Administrador" : ""}
              </span>
              {busy === a.email && <span className="hint">A entrar...</span>}
            </button>
          ))}
        </div>
        <p className="hint">Na versão instalada, cada pessoa entra com o seu email e password.</p>
      </div>
    </div>
  );
}
