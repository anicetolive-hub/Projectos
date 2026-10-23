import { lazy, Suspense, useEffect, useState } from "react";
import { ApiError, request } from "../api";

// Só existe no build de demonstração (comparação literal para o build normal o eliminar)
const DemoLogin =
  import.meta.env.VITE_DEMO === "true" ? lazy(() => import("../demo/DemoLogin").then((m) => ({ default: m.DemoLogin }))) : null;
import { useAuth } from "./context";

/** Ecrã de entrada. Se ainda não existir administrador, pede para criar o primeiro. */
export function LoginPage() {
  return DemoLogin ? (
    <Suspense fallback={null}>
      <DemoLogin />
    </Suspense>
  ) : (
    <CredentialsLogin />
  );
}

function CredentialsLogin() {
  const { login, setup } = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    request<{ setupRequired: boolean }>("/api/auth/status")
      .then((s) => setSetupRequired(s.setupRequired))
      .catch(() => setError("Não foi possível contactar a API. Verifique se o backend está a correr."));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (setupRequired && password !== confirmation) {
      setError("As passwords não coincidem");
      return;
    }
    setBusy(true);
    try {
      if (setupRequired) await setup(fullName, email, password);
      else await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? describe(err) : "Erro ao entrar");
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Tarefas e Projectos</h1>
        <p className="hint" style={{ marginTop: 0 }}>
          {setupRequired
            ? "Primeiro acesso: crie a conta de administrador."
            : "Gestão de performance, KPIs, objetivos e projetos"}
        </p>

        {error && <div className="error-banner">{error}</div>}

        {setupRequired && (
          <label className="form-field">
            Nome completo
            <input required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
        )}
        <label className="form-field">
          Email
          <input
            required
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="form-field">
          Password
          <input
            required
            type="password"
            autoComplete={setupRequired ? "new-password" : "current-password"}
            minLength={setupRequired ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {setupRequired && (
          <label className="form-field">
            Confirmar password
            <input
              required
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
        )}

        <button className="btn" type="submit" disabled={busy || setupRequired === null}>
          {busy ? "A entrar..." : setupRequired ? "Criar administrador e entrar" : "Entrar"}
        </button>
        {!setupRequired && <p className="hint">Esqueceu-se da password? Peça a um administrador para a redefinir.</p>}
      </form>
    </div>
  );
}

function describe(err: ApiError): string {
  const details = err.details as { details?: { fieldErrors?: Record<string, string[]> } } | undefined;
  const fieldErrors = details?.details?.fieldErrors;
  const first = fieldErrors && Object.values(fieldErrors).flat()[0];
  return first ?? err.message;
}
