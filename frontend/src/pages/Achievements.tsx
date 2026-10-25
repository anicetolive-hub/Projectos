import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/context";
import { perfApi, type AchievementInput } from "../performance/api";
import { notifyDataChanged, useReloadOnExternalChange } from "../performance/hooks";
import { ACHIEVEMENT_STATUS_LABEL, ACHIEVEMENT_TYPE_LABEL, formatDate, toDateInput } from "../performance/labels";
import type {
  Achievement,
  AchievementStatus,
  AchievementType,
  Department,
  Objective,
  Person,
  Project,
} from "../performance/types";

const STATUS_HEALTH: Record<AchievementStatus, string> = {
  PROPOSED: "NO_DATA",
  EVALUATING: "YELLOW",
  APPROVED: "GREEN",
  IMPLEMENTED: "GREEN",
  DISCARDED: "NO_DATA",
};

type Filter = AchievementType | "ALL" | "HIGHLIGHTED";

interface FormState {
  title: string;
  type: AchievementType;
  date: string;
  description: string;
  impact: string;
  link: string;
  authorIds: string[];
  departmentId: string;
  projectId: string;
  objectiveId: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function emptyForm(type: AchievementType, me?: string): FormState {
  return {
    title: "",
    type,
    date: today(),
    description: "",
    impact: "",
    link: "",
    authorIds: me ? [me] : [],
    departmentId: "",
    projectId: "",
    objectiveId: "",
  };
}

function formFrom(a: Achievement): FormState {
  return {
    title: a.title,
    type: a.type,
    date: toDateInput(a.date),
    description: a.description ?? "",
    impact: a.impact ?? "",
    link: a.link ?? "",
    authorIds: a.authors.map((p) => p.id),
    departmentId: a.departmentId ?? "",
    projectId: a.projectId ?? "",
    objectiveId: a.objectiveId ?? "",
  };
}

/** Mural dos grandes feitos da direção: soluções, ideias, melhorias e reconhecimentos. */
export function Achievements() {
  const { user } = useAuth();
  const [items, setItems] = useState<Achievement[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    perfApi.achievements.list().then(setItems);
  }, []);
  useReloadOnExternalChange(reload);

  useEffect(() => {
    reload();
    perfApi.people.list().then(setPeople);
    perfApi.departments.list().then(setDepartments);
    perfApi.projects.list().then(setProjects);
    perfApi.objectives.list().then(setObjectives);
  }, [reload]);

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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const data: AchievementInput = {
      title: form.title,
      type: form.type,
      date: form.date,
      description: form.description || null,
      impact: form.impact || null,
      link: form.link || null,
      authorIds: form.authorIds,
      departmentId: form.departmentId || null,
      projectId: form.projectId || null,
      objectiveId: form.objectiveId || null,
    } as AchievementInput;
    const ok = editingId
      ? await run(() => perfApi.achievements.update(editingId, data), "Erro ao guardar")
      : await run(() => perfApi.achievements.create(data), "Erro ao registar");
    if (ok) closeForm();
  }

  function openNew(type: AchievementType) {
    setEditingId(null);
    setForm(emptyForm(type, user?.id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(a: Achievement) {
    setEditingId(a.id);
    setForm(formFrom(a));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
  }

  const year = new Date().getFullYear();
  const thisYear = items.filter((a) => new Date(a.date).getFullYear() === year);
  const stats = [
    { label: `Soluções entregues em ${year}`, value: thisYear.filter((a) => a.type === "SOLUTION").length },
    { label: `Melhorias em ${year}`, value: thisYear.filter((a) => a.type === "IMPROVEMENT").length },
    { label: "Ideias em análise", value: items.filter((a) => a.type === "IDEA" && ["PROPOSED", "EVALUATING", "APPROVED"].includes(a.status)).length },
    { label: "Ideias implementadas", value: items.filter((a) => a.type === "IDEA" && a.status === "IMPLEMENTED").length },
    { label: `Reconhecimentos em ${year}`, value: thisYear.filter((a) => a.type === "RECOGNITION").length },
  ];

  const visible = useMemo(
    () =>
      items.filter((a) => (filter === "ALL" ? true : filter === "HIGHLIGHTED" ? a.highlighted : a.type === filter)),
    [items, filter],
  );
  const count = (t: AchievementType) => items.filter((a) => a.type === t).length;
  // As listas de pessoas e departamentos já vêm limitadas ao âmbito de quem vê,
  // por isso servem para saber se uma chefia pode decidir sobre o feito.
  const isLeader = !!user && user.role !== "STAFF";
  const canEdit = (a: Achievement) =>
    !!user &&
    (user.isAdmin ||
      a.createdById === user.id ||
      a.authors.some((p) => p.id === user.id) ||
      (isLeader &&
        (departments.some((d) => d.id === a.departmentId) ||
          a.authors.some((p) => p.id !== user.id && people.some((x) => x.id === p.id)))));

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Feitos da direção</h2>
          <p className="hint" style={{ margin: 0 }}>
            Soluções desenvolvidas, ideias inovadoras, melhorias e reconhecimentos.
          </p>
        </div>
        <div className="actions">
          <button className="btn secondary" onClick={() => openNew("IDEA")}>
            Propor ideia
          </button>
          <button className="btn" onClick={() => openNew("SOLUTION")}>
            Registar feito
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {form && (
        <form className="card" onSubmit={save}>
          <h3 className="card-title">{editingId ? "Editar feito" : form.type === "IDEA" ? "Propor ideia" : "Registar feito"}</h3>
          <div className="form-grid">
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              Título
              <input
                id="achievement-title"
                required
                minLength={3}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={form.type === "IDEA" ? "ex: Assistente virtual para pedidos de suporte" : "ex: Portal de self-service de TI"}
              />
            </label>
            <label className="form-field">
              Tipo
              <select id="achievement-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AchievementType })}>
                {Object.entries(ACHIEVEMENT_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {form.type === "IDEA" ? "Data da proposta" : "Data"}
              <input id="achievement-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="form-field">
              Departamento
              <select id="achievement-department" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              {form.type === "IDEA" ? "Impacto esperado" : "Impacto"}
              <input
                id="achievement-impact"
                value={form.impact}
                onChange={(e) => setForm({ ...form, impact: e.target.value })}
                placeholder="ex: 120 horas poupadas por mês, 30% menos custos de comunicações"
              />
            </label>
          </div>
          <label className="form-field" style={{ marginBottom: "0.8rem" }}>
            Descrição
            <textarea
              id="achievement-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="O que é e que problema resolve"
            />
          </label>

          <div className="form-field" style={{ marginBottom: "0.8rem" }}>
            Autores
            <div className="author-picker">
              {people
                .filter((p) => p.active)
                .map((p) => (
                  <label key={p.id} className="inline-label">
                    <input
                      type="checkbox"
                      checked={form.authorIds.includes(p.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          authorIds: e.target.checked ? [...form.authorIds, p.id] : form.authorIds.filter((id) => id !== p.id),
                        })
                      }
                    />
                    {p.fullName}
                  </label>
                ))}
            </div>
          </div>

          <div className="form-grid">
            <label className="form-field">
              Projeto relacionado
              <select id="achievement-project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Contribui para o objetivo
              <select id="achievement-objective" value={form.objectiveId} onChange={(e) => setForm({ ...form, objectiveId: e.target.value })}>
                <option value="">—</option>
                {objectives
                  .filter((o) => o.status !== "CANCELLED")
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
              Ligação (documento, notícia...)
              <input id="achievement-link" type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://" />
            </label>
          </div>

          <div className="actions">
            <button className="btn" type="submit" disabled={form.authorIds.length === 0}>
              {editingId ? "Guardar" : form.type === "IDEA" ? "Propor" : "Registar"}
            </button>
            <button className="btn secondary" type="button" onClick={closeForm}>
              Cancelar
            </button>
            {form.authorIds.length === 0 && <span className="hint">Escolha pelo menos um autor.</span>}
          </div>
        </form>
      )}

      <div className="card-grid compact-stats" style={{ marginBottom: "1.2rem" }}>
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="value">{s.value}</div>
            <div className="label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="segmented" style={{ marginBottom: "1rem" }}>
        {(
          [
            ["ALL", `Todos (${items.length})`],
            ["HIGHLIGHTED", "Destaques"],
            ["SOLUTION", `Soluções (${count("SOLUTION")})`],
            ["IDEA", `Ideias (${count("IDEA")})`],
            ["IMPROVEMENT", `Melhorias (${count("IMPROVEMENT")})`],
            ["RECOGNITION", `Reconhecimentos (${count("RECOGNITION")})`],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      <div className="achievement-grid">
        {visible.map((a) => (
          <article key={a.id} className={`achievement-card type-${a.type}${a.status === "DISCARDED" ? " discarded" : ""}`}>
            <header className="achievement-head">
              <span className={`level-tag achievement-tag-${a.type}`}>{ACHIEVEMENT_TYPE_LABEL[a.type]}</span>
              {a.type === "IDEA" && <span className={`badge health-${STATUS_HEALTH[a.status]}`}>{ACHIEVEMENT_STATUS_LABEL[a.status]}</span>}
              {a.highlighted && <span className="achievement-star" title="Em destaque na visão geral">★ Destaque</span>}
            </header>
            <h3>{a.title}</h3>
            {a.description && <p className="achievement-description">{a.description}</p>}
            {a.impact && (
              <p className="achievement-impact">
                <strong>{a.type === "IDEA" && a.status !== "IMPLEMENTED" ? "Impacto esperado: " : "Impacto: "}</strong>
                {a.impact}
              </p>
            )}
            <dl className="achievement-meta">
              <div>
                <dt>Autores</dt>
                <dd>{a.authors.map((p) => p.fullName).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>{a.type === "IDEA" ? "Proposta" : "Data"}</dt>
                <dd>
                  {formatDate(a.date)}
                  {a.department && ` · ${a.department.code}`}
                </dd>
              </div>
              {(a.project || a.objective) && (
                <div>
                  <dt>Ligado a</dt>
                  <dd>{[a.project?.name, a.objective?.title].filter(Boolean).join(" · ")}</dd>
                </div>
              )}
            </dl>
            {a.link && (
              <a href={a.link} target="_blank" rel="noreferrer">
                Abrir documento
              </a>
            )}
            {canEdit(a) && (
              <footer className="achievement-actions">
                {a.type === "IDEA" && (
                  <select
                    aria-label="Estado da ideia"
                    value={a.status}
                    onChange={(e) => run(() => perfApi.achievements.update(a.id, { status: e.target.value as AchievementStatus }), "Erro ao mudar o estado")}
                  >
                    {Object.entries(ACHIEVEMENT_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                {user?.isAdmin && (
                  <button
                    className="btn secondary"
                    onClick={() => run(() => perfApi.achievements.update(a.id, { highlighted: !a.highlighted }), "Erro ao destacar")}
                  >
                    {a.highlighted ? "Tirar destaque" : "Destacar"}
                  </button>
                )}
                <button className="btn secondary" onClick={() => openEdit(a)}>
                  Editar
                </button>
                <button
                  className="btn danger"
                  aria-label="Remover"
                  onClick={() => confirm(`Remover "${a.title}" do mural?`) && run(() => perfApi.achievements.remove(a.id), "Erro ao remover")}
                >
                  ✕
                </button>
              </footer>
            )}
          </article>
        ))}
      </div>
      {visible.length === 0 && (
        <div className="card hint">
          {items.length === 0
            ? "Ainda não há feitos registados. Registe a primeira solução entregue ou proponha uma ideia."
            : "Nenhum feito neste filtro."}
        </div>
      )}
    </div>
  );
}
