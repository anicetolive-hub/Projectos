import { createContext, useContext } from "react";
import type { Role } from "../performance/types";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  role: Role;
  jobTitle: string | null;
  departmentId: string | null;
  isAdmin: boolean;
}

export interface Session {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  setup: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
