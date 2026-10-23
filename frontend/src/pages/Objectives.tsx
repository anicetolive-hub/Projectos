import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/context";
import { perfApi, type ObjectiveInput } from "../performance/api";
import { HealthBadge, ProgressBar, TimingBadge } from "../performance/components";
import { notifyDataChanged, useReloadOnExternalChange } from "../performance/hooks";
import { daysLabel, formatDate, OBJECTIVE_LEVEL_LABEL, scoreHealth, TIMING_HEALTH } from "../performance/labels";
import type { Department, Objective, ObjectiveLevel, ObjectiveStatus, Person } from "../performance/types";

const PARENT_LEVEL: Record<ObjectiveLevel, ObjectiveLevel | null> = {
  STRATEGIC: null,
  DIRECTION: "STRATEGIC",
  INDIVIDUAL: "DIRECTION",
};

const LEVEL_HELP: Record<ObjectiveLevel, string> = {
  STRATEGIC: "Objetivos da organização para o ano. Só administradores os definem.",
  DIRECTION: "Objetivos de cada departamento, alinhados a um objetivo estratégico.",
  INDIVIDUAL: "Objetivos de cada pessoa, alinhados a um objetivo de direção.",
};

const STATUS_LABEL: Record<ObjectiveStatus, string> = {
  ACTIVE: "Em curso",
  ACHIEVED: "Alcançado",
  CANCELLED: "Cancelado",
};

const yearStart = () => `${new Date().getFullYear()}-01-01`;
const yearEnd = () => `${new Date().getFullYear()}-12-31`;

function emptyForm(level: ObjectiveLevel) {
  return {
    title: "",
    description: "",
    level,
    weight: "1",
    progress: "0",
    startDate: yearStart(),
    dueDate: yearEnd(),
    parentId: "",
    departmentId: "",
    ownerId: "",
  };
}

export function Objectives() {
  const { user } = useAuth();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState(() => emptyForm(user?.isAdmin ? "STRATEGIC" : "INDIVIDUAL"));
  const [showForm, setShowForm] = useState(false);
  const [levelFilter, setLevelFilter] = useState<ObjectiveLevel | "MINE" | "">("");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    perfApi.objectives.list().then(setObjectives);
  }, []);
  useReloadOnExternalChange(reload);

  useEffect(() => {
    reload();
    perfApi.people.list().then(setPeople);
    perfApi.departments.list().then(setDepartments);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const data: ObjectiveInput = {
      title: form.title,
      description: form.description || null,
      level: form.level,
      status: "ACTIVE",
      weight: Number(form.weight),
      progress: Number(form.progress),
      startDate: form.startDate,
      dueDate: form.dueDate,
      parentId: form.parentId || null,
      departmentId: form.departmentId || null,
      ownerId: form.ownerId || (form.level === "INDIVIDUAL" ? (user?.id ?? null) : null),
    };
    if (await run(() => perfApi.objectives.create(data), "Erro ao criar objetivo")) {
      setForm(emptyForm(form.level));
      setShowForm(false);
    }
  }

  // Árvore: estratégicos na raiz; objetivos cujo "pai" não está visível também ficam na raiz
  const tree = useMemo(() => {
    const ids = new Set(objectives.map((o) => o.id));
    const rows: { objective: Objective; depth: number }[] = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const o of objectives) {
        const parent = o.parentId && ids.has(o.parentId) ? o.parentId : null;
        if (parent === parentId && !rows.some((r) => r.objective.id === o.id)) {
          rows.push({ objective: o, depth });
          visit(o.id, depth + 1);
        }
      }
    };
    const order: ObjectiveLevel[] = ["STRATEGIC", "DIRECTION", "INDIVIDUAL"];
    const roots = objectives.filter((o) => !(o.parentId && ids.has(o.parentId)));
    roots.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
    for (const root of roots) {
      if (!rows.some((r) => r.objective.id === root.id)) {
        rows.push({ objective: root, depth: 0 });
        visit(root.id, 1);
      }
    }
    return rows;
  }, [objectives]);

  const visibleRows = tree.filter(({ objective: o }) =>
    levelFilter === "" ? true : levelFilter === "MINE" ? o.ownerId === user?.id : o.level === levelFilter,
  );
  const parentOptions = objectives.filter((o) => o.level === PARENT_LEVEL[form.level] && o.status !== "CANCELLED");
  const levels: ObjectiveLevel[] = user?.isAdmin
    ? ["STRATEGIC", "DIRECTION", "INDIVIDUAL"]
    : ["DIRECTION", "INDIVIDUAL"];
  const count = (level: ObjectiveLevel) => objectives.filter((o) => o.level === level).length;

  return (
    <div>
      <div className="page-header">
        <h2>Objetivos</h2>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fechar" : "Novo objetivo"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="segmented" style={{ marginBottom: "0.6rem" }}>
            {levels.map((level) => (
              <button
                type="button"
                key={level}
                className={form.level === level ? "active" : ""}
                onClick={() => setForm({ ...emptyForm(level), title: form.title, description: form.description })}
              >
                {OBJECTIVE_LEVEL_LABEL[level]}
              </button>
            ))}
          </div>
          <p className="hint">{LEVEL_HELP[form.level]}</p>
          <div className="form-grid">
            <label className="form-field" style={{ gridColumn: "1 / -1" }}>
              Objetivo
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="ex: Reduzir o tempo de resolução de incidentes em 20%"
              />
            </label>
            {PARENT_LEVEL[form.level] && (
              <label className="form-field">
                Contribui para ({OBJECTIVE_LEVEL_LABEL[PARENT_LEVEL[form.level] as ObjectiveLevel].toLowerCase()})
                <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                  <option value="">— não alinhado —</option>
                  {parentOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form.level === "DIRECTION" && (
              <label className="form-field">
                Departamento
                <select
                  required
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                >
                  <option value="">Escolha...</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-field">
              Responsável
              <select
                required={form.level === "INDIVIDUAL"}
                value={form.ownerId || (form.level === "INDIVIDUAL" ? (user?.id ?? "") : "")}
                onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
              >
                <option value="">—</option>
                {people
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
              Início
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </label>
            <label className="form-field">
              Prazo
              <input
                type="date"
                required
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </label>
            <label className="form-field">
              Peso
              <input
                type="number"
                min={0.1}
                step="any"
                required
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              />
            </label>
          </div>
          <label className="form-field" style={{ marginBottom: "0.8rem" }}>
            Descrição / como será medido
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <p className="hint">
            O progresso é calculado automaticamente a partir dos KPIs, projetos e objetivos ligados a este objetivo. Sem
            nada ligado, atualiza-se o progresso à mão na lista.
          </p>
          <button className="btn" type="submit">
            Criar objetivo
          </button>
        </form>
      )}

      <div className="card">
        <div className="segmented" style={{ marginBottom: "0.9rem" }}>
          {(
            [
              ["", `Todos (${objectives.length})`],
              ["STRATEGIC", `Estratégicos (${count("STRATEGIC")})`],
              ["DIRECTION", `Direção (${count("DIRECTION")})`],
              ["INDIVIDUAL", `Individuais (${count("INDIVIDUAL")})`],
              ["MINE", "Os meus"],
            ] as [ObjectiveLevel | "MINE" | "", string][]
          ).map(([value, label]) => (
            <button key={value} className={levelFilter === value ? "active" : ""} onClick={() => setLevelFilter(value)}>
              {label}
            </button>
          ))}
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Objetivo</th>
                <th>Responsável</th>
                <th style={{ minWidth: 150 }}>Progresso</th>
                <th>Prazo</th>
                <th>Situação</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ objective: o, depth }) => (
                <ObjectiveRow
                  key={o.id}
                  objective={o}
                  depth={levelFilter === "" ? depth : 0}
                  onUpdate={(data) => run(() => perfApi.objectives.update(o.id, data), "Erro ao atualizar objetivo")}
                  onRemove={() =>
                    confirm(
                      `Remover o objetivo "${o.title}"? Os KPIs, projetos e objetivos ligados ficam sem alinhamento.`,
                    ) && run(() => perfApi.objectives.remove(o.id), "Erro ao remover objetivo")
                  }
                />
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="hint">
                    Nenhum objetivo neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Ligue KPIs e projetos a um objetivo nas páginas KPIs e Projetos. O ritmo compara o progresso com o tempo já
          decorrido e entra na nota do responsável (e do departamento, nos objetivos de direção).
        </p>
      </div>
    </div>
  );
}

function ObjectiveRow({
  objective: o,
  depth,
  onUpdate,
  onRemove,
}: {
  objective: Objective;
  depth: number;
  onUpdate: (data: Partial<ObjectiveInput>) => void;
  onRemove: () => void;
}) {
  const [progress, setProgress] = useState(o.manualProgress);
  useEffect(() => setProgress(o.manualProgress), [o.manualProgress]);
  const editableProgress = o.progressSource === "MANUAL" && o.status === "ACTIVE";
  const links = [
    o.kpiCount && `${o.kpiCount} KPI(s)`,
    o.projectCount && `${o.projectCount} projeto(s)`,
    o.childCount && `${o.childCount} objetivo(s)`,
  ].filter(Boolean);
  const commit = () => progress !== o.manualProgress && onUpdate({ progress });

  return (
    <tr className={o.status === "CANCELLED" ? "row-muted" : ""}>
      <td style={{ paddingLeft: `${0.7 + depth * 1.4}rem` }}>
        <span className={`level-tag level-${o.level}`}>{OBJECTIVE_LEVEL_LABEL[o.level]}</span> {o.title}
        <div className="hint">
          {[o.department?.code, links.length ? `ligado a ${links.join(", ")}` : "progresso manual"]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </td>
      <td>{o.owner?.fullName ?? "-"}</td>
      <td>
        {editableProgress ? (
          <>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              onMouseUp={commit}
              onKeyUp={commit}
              onTouchEnd={commit}
            />
            <span className="hint"> {progress}%</span>
          </>
        ) : (
          <>
            <ProgressBar value={o.progress} health={TIMING_HEALTH[o.schedule.timing]} />
            <span className="hint">{o.progress}%</span>
          </>
        )}
        {o.paceScore !== null && o.status === "ACTIVE" && (
          <div className="hint">
            Ritmo <HealthBadge health={scoreHealth(o.paceScore)} label={`${o.paceScore.toFixed(0)}`} />
          </div>
        )}
      </td>
      <td>
        {formatDate(o.dueDate)}
        {o.status === "ACTIVE" && <div className="hint">{daysLabel(o.schedule.daysRemaining)}</div>}
      </td>
      <td>
        <TimingBadge timing={o.schedule.timing} />
      </td>
      <td>
        <select value={o.status} onChange={(e) => onUpdate({ status: e.target.value as ObjectiveStatus })}>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button className="btn danger" onClick={onRemove}>
          ✕
        </button>
      </td>
    </tr>
  );
}
