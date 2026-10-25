import { Request, Router } from "express";
import { z } from "zod";
import { PERSON_PUBLIC } from "../lib/personSelect";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/asyncHandler";
import { forbidden } from "../middleware/auth";
import { buildScope, canManageDepartment, canManagePerson, LEADER_ROLES, type Scope } from "../services/auth/access";

// Mural de grandes feitos da direção (soluções, ideias, melhorias,
// reconhecimentos). Todos veem tudo e todos podem registar; alterar fica para
// quem registou, os autores, as chefias do departamento e os administradores.
// Decidir o percurso de uma ideia (avaliar, aprovar, pôr de parte) e destacar
// na visão geral é das chefias/administradores.

export const achievementsRouter = Router();

const TYPES = ["SOLUTION", "IDEA", "IMPROVEMENT", "RECOGNITION"] as const;
const STATUSES = ["PROPOSED", "EVALUATING", "APPROVED", "IMPLEMENTED", "DISCARDED"] as const;
const DECISION_STATUSES = new Set(["EVALUATING", "APPROVED", "DISCARDED"]);

const optionalId = z.string().min(1).nullable().optional();
const optionalText = z.string().nullable().optional();

const achievementSchema = z.object({
  title: z.string().trim().min(3),
  description: optionalText,
  type: z.enum(TYPES),
  status: z.enum(STATUSES).optional(),
  impact: optionalText,
  date: z.coerce.date(),
  link: z.string().url("Endereço inválido").nullable().optional().or(z.literal("").transform(() => null)),
  highlighted: z.boolean().optional(),
  authorIds: z.array(z.string().min(1)).max(30).optional(),
  departmentId: optionalId,
  projectId: optionalId,
  objectiveId: optionalId,
});

const include = {
  authors: { select: PERSON_PUBLIC },
  department: true,
  project: { select: { id: true, name: true } },
  objective: { select: { id: true, title: true, level: true } },
  createdBy: { select: PERSON_PUBLIC },
} as const;

async function scopeFor(req: Request): Promise<Scope> {
  const [departments, people] = await Promise.all([
    prisma.department.findMany({ select: { id: true, parentId: true } }),
    prisma.person.findMany({ select: { id: true, departmentId: true } }),
  ]);
  return buildScope(req.user!, departments, people);
}

/** Pode decidir sobre o feito: administrador ou chefia do departamento (ou de algum autor). */
function canDecide(req: Request, scope: Scope, a: { departmentId?: string | null; authorIds: string[] }) {
  if (req.user!.isAdmin) return true;
  if (!LEADER_ROLES.has(req.user!.role)) return false;
  return canManageDepartment(scope, a.departmentId) || (a.authorIds.length > 0 && a.authorIds.some((id) => scope.personIds.has(id) && id !== req.user!.id));
}

function canEdit(req: Request, scope: Scope, a: { createdById: string | null; departmentId: string | null; authorIds: string[] }) {
  return a.createdById === req.user!.id || a.authorIds.includes(req.user!.id) || canDecide(req, scope, a);
}

achievementsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.achievement.findMany({ include, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }));
  }),
);

achievementsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = achievementSchema.parse(req.body);
    const scope = await scopeFor(req);
    const authorIds = data.authorIds?.length ? [...new Set(data.authorIds)] : [req.user!.id];

    // Quem não é administrador regista feitos seus ou da sua equipa
    if (!req.user!.isAdmin && !authorIds.includes(req.user!.id) && !authorIds.every((id) => canManagePerson(scope, id))) {
      throw forbidden("Só pode registar feitos em que participou ou da sua equipa");
    }
    let status = data.status ?? (data.type === "IDEA" ? "PROPOSED" : "IMPLEMENTED");
    if (DECISION_STATUSES.has(status) && !canDecide(req, scope, { departmentId: data.departmentId, authorIds })) {
      status = "PROPOSED";
    }

    const { authorIds: _ignored, highlighted, ...rest } = data;
    const created = await prisma.achievement.create({
      data: {
        ...rest,
        status,
        highlighted: req.user!.isAdmin ? (highlighted ?? false) : false,
        createdById: req.user!.id,
        authors: { connect: authorIds.map((id) => ({ id })) },
      },
      include,
    });
    res.status(201).json(created);
  }),
);

achievementsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = achievementSchema.partial().parse(req.body);
    const current = await prisma.achievement.findUnique({ where: { id: req.params.id }, include: { authors: { select: { id: true } } } });
    if (!current) return res.status(404).json({ error: "Feito não encontrado" });

    const scope = await scopeFor(req);
    const currentInfo = { ...current, authorIds: current.authors.map((a) => a.id) };
    if (!canEdit(req, scope, currentInfo)) {
      throw forbidden("Só quem registou, os autores, as chefias do departamento ou um administrador podem alterar este feito");
    }
    if (data.highlighted !== undefined && !req.user!.isAdmin) throw forbidden("Só administradores destacam feitos");
    if (data.status && data.status !== current.status && DECISION_STATUSES.has(data.status) && !canDecide(req, scope, currentInfo)) {
      throw forbidden("Avaliar, aprovar ou pôr de parte uma ideia cabe às chefias ou a um administrador");
    }

    const { authorIds, ...rest } = data;
    const updated = await prisma.achievement.update({
      where: { id: current.id },
      data: { ...rest, ...(authorIds ? { authors: { set: [...new Set(authorIds)].map((id) => ({ id })) } } : {}) },
      include,
    });
    res.json(updated);
  }),
);

achievementsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const current = await prisma.achievement.findUnique({ where: { id: req.params.id }, include: { authors: { select: { id: true } } } });
    if (!current) return res.status(404).json({ error: "Feito não encontrado" });
    const scope = await scopeFor(req);
    if (!canEdit(req, scope, { ...current, authorIds: current.authors.map((a) => a.id) })) {
      throw forbidden("Só quem registou, os autores, as chefias do departamento ou um administrador podem remover este feito");
    }
    await prisma.achievement.delete({ where: { id: current.id } });
    res.status(204).send();
  }),
);
