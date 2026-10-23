import { Request, Router } from "express";
import { z } from "zod";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { LoginThrottle } from "../services/auth/loginThrottle";
import { hashPassword, MIN_PASSWORD_LENGTH, newSessionToken, verifyPassword } from "../services/auth/password";

export const authRouter = Router();

const throttle = new LoginThrottle();
const password = z.string().min(MIN_PASSWORD_LENGTH, `A password deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
const email = z
  .string()
  .email()
  .transform((e) => e.trim().toLowerCase());

async function startSession(personId: string) {
  const { token, tokenHash } = newSessionToken();
  const expiresAt = new Date(Date.now() + env.auth.sessionTtlHours * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash, personId, expiresAt } });
  // Limpa sessões expiradas desta pessoa, para a tabela não crescer sem fim
  await prisma.session.deleteMany({ where: { personId, expiresAt: { lt: new Date() } } });
  return { token, expiresAt: expiresAt.toISOString() };
}

function publicUser(p: {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  jobTitle: string | null;
  departmentId: string | null;
  isAdmin: boolean;
}) {
  const { id, fullName, email, role, jobTitle, departmentId, isAdmin } = p;
  return { id, fullName, email, role, jobTitle, departmentId, isAdmin };
}

async function setupRequired(): Promise<boolean> {
  return (await prisma.person.count({ where: { isAdmin: true, passwordHash: { not: null }, active: true } })) === 0;
}

// Indica ao ecrã de login se ainda é preciso criar o primeiro administrador
authRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json({ setupRequired: await setupRequired() });
  }),
);

// Cria o primeiro administrador. Só funciona enquanto não existir nenhum.
authRouter.post(
  "/setup",
  asyncHandler(async (req, res) => {
    if (!(await setupRequired())) {
      return res.status(409).json({ error: "O administrador já foi configurado. Faça login." });
    }
    const data = z.object({ fullName: z.string().min(2), email, password }).parse(req.body);
    const passwordHash = await hashPassword(data.password);
    const person = await prisma.person.upsert({
      where: { email: data.email },
      create: { fullName: data.fullName, email: data.email, role: "DIRECTOR", isAdmin: true, passwordHash },
      update: { fullName: data.fullName, isAdmin: true, active: true, passwordHash },
    });
    res.status(201).json({ ...(await startSession(person.id)), user: publicUser(person) });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const data = z.object({ email, password: z.string().min(1) }).parse(req.body);
    const key = data.email;

    const locked = throttle.lockedMinutes(key);
    if (locked > 0) {
      return res.status(429).json({ error: `Demasiadas tentativas falhadas. Tente novamente dentro de ${locked} min.` });
    }

    const person = await prisma.person.findUnique({ where: { email: data.email } });
    const valid = person?.active ? await verifyPassword(data.password, person.passwordHash) : false;
    if (!person || !valid) {
      throttle.registerFailure(key);
      return res.status(401).json({ error: "Email ou password incorretos" });
    }

    throttle.registerSuccess(key);
    res.json({ ...(await startSession(person.id)), user: publicUser(person) });
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req: Request, res) => {
    await prisma.session.delete({ where: { id: req.sessionId } });
    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const person = await prisma.person.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json(publicUser(person));
  }),
);

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = z.object({ currentPassword: z.string().min(1), newPassword: password }).parse(req.body);
    const person = await prisma.person.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await verifyPassword(data.currentPassword, person.passwordHash))) {
      return res.status(400).json({ error: "A password atual está incorreta" });
    }
    await prisma.$transaction([
      prisma.person.update({ where: { id: person.id }, data: { passwordHash: await hashPassword(data.newPassword) } }),
      // Termina as outras sessões abertas (ex: noutro computador)
      prisma.session.deleteMany({ where: { personId: person.id, id: { not: req.sessionId } } }),
    ]);
    res.status(204).send();
  }),
);
