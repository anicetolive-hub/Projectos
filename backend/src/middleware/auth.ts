import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { hashToken } from "../services/auth/password";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  departmentId: string | null;
  isAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

/** Exige um token de sessão válido no cabeçalho "Authorization: Bearer <token>". */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Sessão necessária. Faça login." });

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { person: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.person.active || !session.person.passwordHash) {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }

    const p = session.person;
    req.user = { id: p.id, fullName: p.fullName, email: p.email, role: p.role, departmentId: p.departmentId, isAdmin: p.isAdmin };
    req.sessionId = session.id;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: "Apenas administradores podem fazer esta operação" });
  next();
}

/** Erro HTTP 403 para ser lançado dentro dos handlers. */
export function forbidden(message = "Sem permissão para esta operação"): Error {
  return Object.assign(new Error(message), { status: 403 });
}
