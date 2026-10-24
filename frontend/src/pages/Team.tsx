import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/context";
import { perfApi } from "../performance/api";
import { HealthBadge, ScoreValue } from "../performance/components";
import { notifyDataChanged, useReloadOnExternalChange } from "../performance/hooks";
import { ROLE_LABEL } from "../performance/labels";
import { departmentTree } from "../performance/tree";
import type { Department, Person, Role } from "../performance/types";

const emptyDepartment = { name: "", code: "", description: "", parentId: "" };
const emptyPerson = {
  fullName: "",
  email: "",
  jobTitle: "",
  role: "COORDINATOR" as Role,
  departmentId: "",
  password: "",
};

export function Team() {
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [deptForm, setDeptForm] = useState(emptyDepartment);
  const [personForm, setPersonForm] = useState(emptyPerson);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    perfApi.departments.list().then(setDepartments);
    perfApi.people.list().then(setPeople);
  }, []);
  useReloadOnExternalChange(reload);

  useEffect(reload, [reload]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
      reload();
      notifyDataChanged();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
      return false;
    }
  }

  async function createDepartment(e: React.FormEvent) {
    e.preventDefault();
    const data = { ...deptForm, parentId: deptForm.parentId || null };
    if (await run(() => perfApi.departments.create(data), "Erro ao criar departamento")) setDeptForm(emptyDepartment);
  }

  async function createPerson(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      ...personForm,
      email: personForm.email || null,
      departmentId: personForm.departmentId || null,
      password: personForm.password || undefined,
    };
    if (await run(() => perfApi.people.create(data), "Erro ao adicionar pessoa")) setPersonForm(emptyPerson);
  }

  async function resetPassword(person: Person) {
    const password = prompt(`Nova password para ${person.fullName} (mínimo 8 caracteres):`);
    if (!password) return;
    if (await run(() => perfApi.people.update(person.id, { password }), "Erro ao definir password")) {
      alert(`Password definida. Comunique-a a ${person.fullName} e peça para a alterar no primeiro acesso.`);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Equipa e estrutura</h2>
      </div>
      {!isAdmin && <p className="hint">Só administradores podem alterar a estrutura e as pessoas.</p>}

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h3 className="card-title">Departamentos</h3>
        {isAdmin && (
          <form className="inline-form" onSubmit={createDepartment}>
            <input
              required
              placeholder="Nome do departamento"
              value={deptForm.name}
              onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
            />
            <input
              required
              placeholder="Sigla (ex: INFRA)"
              value={deptForm.code}
              onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
              style={{ width: 130 }}
            />
            <select value={deptForm.parentId} onChange={(e) => setDeptForm({ ...deptForm, parentId: e.target.value })}>
              <option value="">Topo (direção)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  Subordinado a {d.code}
                </option>
              ))}
            </select>
            <button className="btn" type="submit">
              Adicionar
            </button>
          </form>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Departamento</th>
                <th>Responsável</th>
                <th>Subordinado a</th>
                <th className="num">Pessoas</th>
                <th className="num">Nota</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {departmentTree(departments).map(({ department: d, depth }) => (
                <tr key={d.id}>
                  <td style={{ paddingLeft: `${0.7 + depth * 1.2}rem` }}>
                    <strong>{d.code}</strong> {d.name}
                  </td>
                  <td>{d.head?.fullName ?? <span className="hint">sem gestor/coordenador</span>}</td>
                  <td>
                    <select
                      disabled={!isAdmin}
                      value={d.parentId ?? ""}
                      onChange={(e) =>
                        run(
                          () => perfApi.departments.update(d.id, { parentId: e.target.value || null }),
                          "Erro ao mover departamento",
                        )
                      }
                    >
                      <option value="">Topo (direção)</option>
                      {departments
                        .filter((o) => o.id !== d.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.code}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="num">{d.memberCount}</td>
                  <td className="num">
                    <ScoreValue score={d.consolidatedScore} health={d.consolidatedHealth} />
                  </td>
                  <td>
                    {isAdmin && (
                      <button
                        className="btn danger"
                        onClick={() =>
                          confirm(`Remover o departamento ${d.code}?`) &&
                          run(() => perfApi.departments.remove(d.id), "Erro ao remover departamento")
                        }
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {departments.length === 0 && (
                <tr>
                  <td colSpan={6} className="hint">
                    Crie primeiro a direção (ex: DSI) e depois as áreas subordinadas a ela.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Pessoas</h3>
        {isAdmin && (
          <form className="inline-form" onSubmit={createPerson}>
            <input
              required
              placeholder="Nome completo"
              value={personForm.fullName}
              onChange={(e) => setPersonForm({ ...personForm, fullName: e.target.value })}
            />
            <input
              placeholder="Função (ex: Coordenador de Redes)"
              value={personForm.jobTitle}
              onChange={(e) => setPersonForm({ ...personForm, jobTitle: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email (login)"
              value={personForm.email}
              onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })}
            />
            <input
              type="password"
              placeholder="Password inicial (opcional)"
              minLength={8}
              autoComplete="new-password"
              value={personForm.password}
              onChange={(e) => setPersonForm({ ...personForm, password: e.target.value })}
            />
            <select
              value={personForm.role}
              onChange={(e) => setPersonForm({ ...personForm, role: e.target.value as Role })}
            >
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={personForm.departmentId}
              onChange={(e) => setPersonForm({ ...personForm, departmentId: e.target.value })}
            >
              <option value="">Departamento</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                </option>
              ))}
            </select>
            <button className="btn" type="submit">
              Adicionar
            </button>
          </form>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Nível</th>
                <th>Departamento</th>
                <th className="num">Nota</th>
                <th>Situação</th>
                <th>Ativo</th>
                <th>Acesso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className={p.active ? "" : "row-muted"}>
                  <td>
                    {p.fullName}
                    <div className="hint">{[p.jobTitle, p.email].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>
                    <select
                      disabled={!isAdmin}
                      value={p.role}
                      onChange={(e) =>
                        run(() => perfApi.people.update(p.id, { role: e.target.value as Role }), "Erro ao atualizar")
                      }
                    >
                      {Object.entries(ROLE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      disabled={!isAdmin}
                      value={p.departmentId ?? ""}
                      onChange={(e) =>
                        run(
                          () => perfApi.people.update(p.id, { departmentId: e.target.value || null }),
                          "Erro ao atualizar",
                        )
                      }
                    >
                      <option value="">—</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <ScoreValue score={p.scorecard?.score ?? null} health={p.scorecard?.health ?? "NO_DATA"} />
                  </td>
                  <td>
                    <HealthBadge health={p.scorecard?.health ?? "NO_DATA"} />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={p.active}
                      onChange={(e) =>
                        run(() => perfApi.people.update(p.id, { active: e.target.checked }), "Erro ao atualizar")
                      }
                    />
                  </td>
                  <td>
                    <span className="hint">
                      {p.hasPassword ? (p.isAdmin ? "Administrador" : "Com login") : "Sem login"}
                    </span>
                    {isAdmin && (
                      <div className="actions" style={{ marginTop: "0.3rem" }}>
                        <button
                          className="link-button hint"
                          onClick={() => resetPassword(p)}
                          disabled={!p.email}
                          title={p.email ? "" : "Defina primeiro um email"}
                        >
                          {p.hasPassword ? "Redefinir password" : "Dar acesso"}
                        </button>
                        {p.id !== user?.id && (
                          <label className="inline-label">
                            <input
                              type="checkbox"
                              checked={p.isAdmin}
                              onChange={(e) =>
                                run(
                                  () => perfApi.people.update(p.id, { isAdmin: e.target.checked }),
                                  "Erro ao atualizar",
                                )
                              }
                            />
                            admin
                          </label>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    {isAdmin && p.id !== user?.id && (
                      <button
                        className="btn danger"
                        onClick={() =>
                          confirm(`Remover ${p.fullName}? Os KPIs, projetos e tarefas ficam sem responsável.`) &&
                          run(() => perfApi.people.remove(p.id), "Erro ao remover pessoa")
                        }
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={8} className="hint">
                    Nenhuma pessoa cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
