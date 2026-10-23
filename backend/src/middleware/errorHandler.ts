import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

interface HttpError extends Error {
  status?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Dados inválidos", details: err.flatten() });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ error: "Já existe um registo com este valor único" });
    if (err.code === "P2025") return res.status(404).json({ error: "Registo não encontrado" });
    if (err.code === "P2003") return res.status(400).json({ error: "Referência inválida a outro registo" });
  }

  const httpError = err as HttpError;
  const status = httpError.status ?? 500;
  const message = httpError.message ?? "Erro interno";

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
}
