import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getToken, request, setToken } from "../api";
import { AuthContext, type AuthState, type AuthUser, type Session } from "./context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(() => !!getToken());

  useEffect(() => {
    if (!getToken()) return;
    request<AuthUser>("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener("auth-expired", expired);
    return () => window.removeEventListener("auth-expired", expired);
  }, []);

  const startSession = useCallback((session: Session) => {
    setToken(session.token);
    setUser(session.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (email, password) =>
        startSession(
          await request<Session>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
        ),
      setup: async (fullName, email, password) =>
        startSession(
          await request<Session>("/api/auth/setup", {
            method: "POST",
            body: JSON.stringify({ fullName, email, password }),
          }),
        ),
      logout: async () => {
        await request<void>("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        setToken(null);
        setUser(null);
      },
      changePassword: async (currentPassword, newPassword) => {
        await request<void>("/api/auth/change-password", {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword }),
        });
      },
    }),
    [user, loading, startSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
