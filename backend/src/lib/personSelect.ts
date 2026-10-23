// Campos de Person que podem sair na API. Nunca incluir passwordHash.
export const PERSON_PUBLIC = {
  id: true,
  fullName: true,
  email: true,
  jobTitle: true,
  role: true,
  departmentId: true,
  active: true,
  isAdmin: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Remove campos sensíveis de um registo de pessoa devolvido pelo Prisma. */
export function toPublicPerson<T extends { passwordHash?: string | null }>(person: T): Omit<T, "passwordHash"> & { hasPassword: boolean } {
  const { passwordHash, ...rest } = person;
  return { ...rest, hasPassword: !!passwordHash };
}
