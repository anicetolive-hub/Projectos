import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/services/auth/password";
import { buildDemoData } from "./demoData";

// Carrega os dados de exemplo do módulo de performance (ver demoData.ts).
// Só cria dados quando o módulo ainda está vazio.
//
// Todas as pessoas de exemplo recebem a password DEMO_PASSWORD (troque-a no
// primeiro acesso em "Alterar password"); o diretor é administrador.

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Mudar@2026";

const prisma = new PrismaClient();

async function main() {
  if ((await prisma.department.count()) > 0) {
    console.log("Módulo de performance já tem dados; seed ignorado.");
    return;
  }

  const data = buildDemoData();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // Ordem respeita as chaves estrangeiras; dentro de cada lista os "pais" vêm primeiro
  await prisma.$transaction([
    prisma.department.createMany({ data: data.departments }),
    prisma.person.createMany({ data: data.people.map((p) => ({ ...p, passwordHash })) }),
    prisma.objective.createMany({ data: data.objectives }),
    prisma.kpi.createMany({ data: data.kpis }),
    prisma.kpiMeasurement.createMany({ data: data.measurements }),
    prisma.project.createMany({ data: data.projects }),
    prisma.task.createMany({ data: data.tasks }),
  ]);

  const admin = data.people.find((p) => p.isAdmin);
  console.log("Dados de exemplo do módulo de performance criados.");
  console.log(`Login de administrador: ${admin?.email} / ${DEMO_PASSWORD} (as outras pessoas usam a mesma password)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
