import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../middleware/auth";
import { buildScope, canManageDepartment, canManagePerson } from "./access";
import { LoginThrottle } from "./loginThrottle";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifica a password correta e rejeita a errada", async () => {
    const hash = await hashPassword("segredo123");
    expect(hash).not.toContain("segredo123");
    expect(await verifyPassword("segredo123", hash)).toBe(true);
    expect(await verifyPassword("errada", hash)).toBe(false);
    expect(await verifyPassword("segredo123", null)).toBe(false);
  });

  it("gera hashes diferentes para a mesma password (salt)", async () => {
    expect(await hashPassword("abc12345")).not.toBe(await hashPassword("abc12345"));
  });
});

describe("LoginThrottle", () => {
  it("bloqueia após 5 falhas e liberta depois do tempo", () => {
    const throttle = new LoginThrottle(5, 60_000);
    for (let i = 0; i < 4; i++) throttle.registerFailure("a", 0);
    expect(throttle.lockedMinutes("a", 0)).toBe(0);
    throttle.registerFailure("a", 0);
    expect(throttle.lockedMinutes("a", 0)).toBe(1);
    expect(throttle.lockedMinutes("a", 60_001)).toBe(0);
    // Após o bloqueio expirar, a contagem recomeça
    throttle.registerFailure("a", 60_001);
    expect(throttle.lockedMinutes("a", 60_001)).toBe(0);
  });

  it("limpa as falhas após login com sucesso", () => {
    const throttle = new LoginThrottle(2, 60_000);
    throttle.registerFailure("a", 0);
    throttle.registerSuccess("a");
    throttle.registerFailure("a", 0);
    expect(throttle.lockedMinutes("a", 0)).toBe(0);
  });
});

describe("âmbito de acesso", () => {
  const departments = [
    { id: "dsi", parentId: null },
    { id: "infra", parentId: "dsi" },
    { id: "redes", parentId: "infra" },
    { id: "sd", parentId: "dsi" },
  ];
  const people = [
    { id: "diretor", departmentId: "dsi" },
    { id: "gestor", departmentId: "infra" },
    { id: "tecRedes", departmentId: "redes" },
    { id: "tecSd", departmentId: "sd" },
  ];
  const user = (id: string, role: string, departmentId: string, isAdmin = false): AuthUser => ({
    id,
    fullName: id,
    email: null,
    role,
    departmentId,
    isAdmin,
  });

  it("administrador vê tudo", () => {
    const scope = buildScope(user("diretor", "DIRECTOR", "dsi", true), departments, people);
    expect(scope.all).toBe(true);
    expect(canManagePerson(scope, "tecSd")).toBe(true);
  });

  it("gestor vê o seu departamento e as áreas subordinadas", () => {
    const scope = buildScope(user("gestor", "MANAGER", "infra"), departments, people);
    expect([...scope.departmentIds].sort()).toEqual(["infra", "redes"]);
    expect(canManagePerson(scope, "tecRedes")).toBe(true);
    expect(canManagePerson(scope, "tecSd")).toBe(false);
    expect(canManageDepartment(scope, "dsi")).toBe(false);
  });

  it("colaborador só se vê a si próprio", () => {
    const scope = buildScope(user("tecSd", "STAFF", "sd"), departments, people);
    expect(scope.departmentIds.size).toBe(0);
    expect([...scope.personIds]).toEqual(["tecSd"]);
  });
});
