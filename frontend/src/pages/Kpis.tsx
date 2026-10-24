import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/context";
import { perfApi, type KpiInput } from "../performance/api";
import { HealthBadge } from "../performance/components";
import { notifyDataChanged, useReloadOnExternalChange } from "../performance/hooks";
import { FREQUENCY_LABEL, formatNumber } from "../performance/labels";
import { departmentTree } from "../performance/tree";
import type { Department, Kpi, KpiDirection, KpiFrequency, Objective, Person } from "../performance/types";

const emptyKpi = {
  name: "",
  description: "",
  unit: "%",
  direction: "HIGHER_IS_BETTER" as KpiDirection,
  frequency: "MONTHLY" as KpiFrequency,
  target: "",
  warningThreshold: "90",
  weight: "1",
  departmentId: "",
  ownerId: "",
  objectiveId: "",
};

const TREND_ICON = { UP: "▲", DOWN: "▼", STABLE: "▬" } as const;

export function Kpis() {
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [form, setForm] = useState(emptyKpi);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    perfApi.kpis.list().then(setKpis);
  }, []);
  useReloadOnExternalChange(reload);

  useEffect(() => {
    reload();
    perfApi.departments.list().then(setDepartments);
    perfApi.people.list().then(setPeople);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const data: KpiInput = {
      ...form,
      target: Number(form.target),
      warningThreshold: Number(form.warningThreshold),
      weight: Number(form.weight),
      departmentId: form.departmentId || null,
      ownerId: form.ownerId || null,
      objectiveId: form.objectiveId || null,
    };
    if (await run(() => perfApi.kpis.create(data), "Erro ao criar KPI")) {
      setForm(emptyKpi);
      setShowForm(false);
    }
  }

  const groups = [
    ...departmentTree(departments).map(({ department }) => ({
      key: department.id,
      title: `${department.code} — ${department.name}`,
      kpis: kpis.filter((k) => k.departmentId === department.id),
    })),
    { key: "none", title: "Sem departamento", kpis: kpis.filter((k) => !k.departmentId) },
  ].filter((g) => g.kpis.length > 0);

  return (
    <div>
      <div className="page-header">
        <h2>KPIs</h2>
        {isAdmin && (
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Fechar" : "Novo KPI"}
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="form-grid">
            <label className="form-field">
              Nome do KPI
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ex: Tickets resolvidos no SLA"
              />
            </label>
            <label className="form-field">
              Departamento
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Responsável (gestor/coordenador)
              <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
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
              Contribui para o objetivo
              <select value={form.objectiveId} onChange={(e) => setForm({ ...form, objectiveId: e.target.value })}>
                <option value="">—</option>
                {objectives
                  .filter((o) => o.status === "ACTIVE")
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
              Meta
              <input
                required
                type="number"
                step="any"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
              />
            </label>
            <label className="form-field">
              Unidade
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="%, h, tickets..."
              />
            </label>
            <label className="form-field">
              Sentido
              <select
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as KpiDirection })}
              >
                <option value="HIGHER_IS_BETTER">Quanto maior, melhor</option>
                <option value="LOWER_IS_BETTER">Quanto menor, melhor</option>
              </select>
            </label>
            <label className="form-field">
              Frequência de medição
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as KpiFrequency })}
              >
                {Object.entries(FREQUENCY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Limiar crítico (% da meta)
              <input
                required
                type="number"
                min={0}
                max={100}
                value={form.warningThreshold}
                onChange={(e) => setForm({ ...form, warningThreshold: e.target.value })}
              />
            </label>
            <label className="form-field">
              Peso na avaliação
              <input
                required
                type="number"
                min={0.1}
                step="any"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
              />
            </label>
          </div>
          <p className="hint">
            Atingimento ≥ 100% da meta fica verde; entre o limiar crítico e 100% fica amarelo; abaixo do limiar fica
            vermelho e gera alerta crítico.
          </p>
          <button className="btn" type="submit">
            Criar KPI
          </button>
        </form>
      )}

      {groups.map((group) => (
        <div className="card" key={group.key}>
          <h3 className="card-title">{group.title}</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>KPI</th>
                  <th>Responsável</th>
                  <th className="num">Meta</th>
                  <th className="num">Último valor</th>
                  <th className="num">Atingimento</th>
                  <th>Situação</th>
                  <th>Registar valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.kpis.map((k) => (
                  <KpiRow
                    key={k.id}
                    kpi={k}
                    expanded={expanded === k.id}
                    onToggle={() => setExpanded(expanded === k.id ? null : k.id)}
                    onMeasure={(period, value) =>
                      run(() => perfApi.kpis.addMeasurement(k.id, { period, value }), "Erro ao registar valor")
                    }
                    onRemoveMeasurement={(id) =>
                      run(() => perfApi.kpis.removeMeasurement(k.id, id), "Erro ao remover medição")
                    }
                    objectives={objectives}
                    isAdmin={isAdmin}
                    onLinkObjective={(objectiveId) =>
                      run(() => perfApi.kpis.update(k.id, { objectiveId }), "Erro ao ligar objetivo")
                    }
                    onRemove={() =>
                      confirm(`Remover o KPI "${k.name}" e o seu histórico?`) &&
                      run(() => perfApi.kpis.remove(k.id), "Erro ao remover KPI")
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {groups.length === 0 && <p className="hint">Nenhum KPI cadastrado.</p>}
    </div>
  );
}

function KpiRow({
  kpi: k,
  expanded,
  onToggle,
  onMeasure,
  onRemoveMeasurement,
  objectives,
  isAdmin,
  onLinkObjective,
  onRemove,
}: {
  kpi: Kpi;
  objectives: Objective[];
  isAdmin: boolean;
  onLinkObjective: (objectiveId: string | null) => void;
  expanded: boolean;
  onToggle: () => void;
  onMeasure: (period: string, value: number) => Promise<boolean>;
  onRemoveMeasurement: (id: string) => void;
  onRemove: () => void;
}) {
  const [period, setPeriod] = useState(k.evaluation.expectedPeriod);
  const [value, setValue] = useState("");
  const ev = k.evaluation;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === "") return;
    if (await onMeasure(period, Number(value))) setValue("");
  }

  return (
    <>
      <tr>
        <td>
          <button className="link-button" onClick={onToggle} title="Ver histórico">
            {expanded ? "▾" : "▸"} {k.name}
          </button>
          <div className="hint">
            {FREQUENCY_LABEL[k.frequency]} · {k.direction === "LOWER_IS_BETTER" ? "menor é melhor" : "maior é melhor"} ·
            peso {k.weight}
          </div>
        </td>
        <td>{k.owner?.fullName ?? "-"}</td>
        <td className="num">{formatNumber(k.target, k.unit)}</td>
        <td className="num">
          {formatNumber(ev.latestValue, k.unit)}
          {ev.latestPeriod && <div className="hint">{ev.latestPeriod}</div>}
        </td>
        <td className="num">
          {formatNumber(ev.attainment, "%")}{" "}
          {ev.trend && (
            <span
              className={ev.trend === "UP" ? "health-text-GREEN" : ev.trend === "DOWN" ? "health-text-RED" : "hint"}
            >
              {TREND_ICON[ev.trend]}
            </span>
          )}
        </td>
        <td>
          <HealthBadge health={ev.health} />
          {ev.missingLastPeriod && <div className="hint health-text-YELLOW">falta {ev.expectedPeriod}</div>}
        </td>
        <td>
          <form className="inline-form compact" onSubmit={submit}>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{ width: 90 }}
              title="Período (ex: 2026-10, 2026-Q4, 2026-W43, 2026)"
            />
            <input
              type="number"
              step="any"
              placeholder="Valor"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={{ width: 80 }}
            />
            <button className="btn secondary" type="submit">
              OK
            </button>
          </form>
        </td>
        <td>
          {isAdmin && (
            <button className="btn danger" onClick={onRemove}>
              ✕
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="row-detail">
          <td colSpan={8}>
            {k.description && <p style={{ marginTop: 0 }}>{k.description}</p>}
            <p style={{ marginTop: 0 }} className="hint">
              Contribui para o objetivo:{" "}
              {isAdmin ? (
                <select value={k.objectiveId ?? ""} onChange={(e) => onLinkObjective(e.target.value || null)}>
                  <option value="">—</option>
                  {objectives.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              ) : (
                (objectives.find((o) => o.id === k.objectiveId)?.title ?? "—")
              )}
            </p>
            {k.measurements.length === 0 ? (
              <span className="hint">Sem medições registadas.</span>
            ) : (
              <div className="history">
                {[...k.measurements].reverse().map((m) => (
                  <div key={m.id} className="history-item">
                    <div className="hint">{m.period}</div>
                    <strong>{formatNumber(m.value, k.unit)}</strong>
                    <button
                      className="link-button hint"
                      onClick={() => confirm(`Remover a medição de ${m.period}?`) && onRemoveMeasurement(m.id)}
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
