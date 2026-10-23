const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Token da sessão de login. Fica no navegador para sobreviver a recarregamentos;
// a API invalida-o no logout, na troca de password ou ao expirar.
const TOKEN_KEY = "auth.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // armazenamento indisponível: a sessão dura até fechar a página
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  // Comparação literal (e não a constante DEMO) para o build normal eliminar o código da demonstração
  if (import.meta.env.VITE_DEMO === "true") return demoRequest<T>(path, token, init);
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  // Sessão expirada ou terminada: volta ao ecrã de login
  if (response.status === 401 && token && !path.startsWith("/api/auth/login")) {
    setToken(null);
    window.dispatchEvent(new Event("auth-expired"));
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === "object" && body && "error" in body ? String(body.error) : String(body);
    throw new ApiError(message, response.status, body);
  }

  return body as T;
}

/** Na demonstração, as chamadas são respondidas no navegador (ver demo/mockApi.ts). */
async function demoRequest<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const { mockRequest } = await import("./demo/mockApi");
  try {
    return await mockRequest<T>(path, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers as Record<string, string>) },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("auth-expired"));
    }
    throw err;
  }
}
