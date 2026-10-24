import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api";
import { useReloadOnExternalChange } from "../performance/hooks";
import { perfApi } from "../performance/api";
import { AlertList } from "../performance/AlertList";
import { HealthBadge, ProgressBar, ScoreValue, TimingBadge } from "../performance/components";
import { formatDate, ROLE_LABEL, scoreHealth, TIMING_HEALTH } from "../performance/labels";
import { departmentTree } from "../performance/tree";
import type { Dashboard } from "../performance/types";

export function PerformanceDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    perfApi
      .dashboard()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível carregar o painel"));
  }, []);
  useReloadOnExternalChange(load);

  useEffect(load, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p className="hint">Carregando...</p>;

  const roots = data.departments.filter((d) => !d.parentId);
  const directionScore =
    roots.length === 1 ? roots[0].consolidatedScore : average(roots.map((d) => d.consolidatedScore));
  const critical = data.alerts.filter((a) => a.severity === "CRITICAL").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Performance</h2>
          <p className="hint" style={{ margin: 0 }}>
            Atualizado às {new Date(data.generatedAt).toLocaleTimeString("pt-PT")}
          </p>
        </div>
        <button className="btn secondary" onClick={load}>
          Atualizar
        </button>
      </div>

      <div className="card-grid" style={{ marginBottom: "1.2rem" }}>
        <div className="stat">
          <div className="value">
            <ScoreValue score={directionScore} health={scoreHealth(directionScore)} />
          </div>
          <div className="label">Nota consolidada da direção</div>
        </div>
        <div className="stat">
          <div className="value health-text-RED">{data.kpiHealth.RED ?? 0}</div>
          <div className="label">
            KPIs críticos <span className="hint">(de {sum(Object.values(data.kpiHealth))})</span>
          </div>
        </div>
        <div className="stat">
          <div className="value health-text-RED">{data.taskTiming.OVERDUE ?? 0}</div>
          <div className="label">Tarefas em atraso</div>
        </div>
        <div className="stat">
          <div className="value health-text-YELLOW">
            {(data.taskTiming.AT_RISK ?? 0) + (data.taskTiming.DUE_SOON ?? 0)}
          </div>
          <div className="label">Tarefas em risco / a terminar</div>
        </div>
        <div className="stat">
          <div className={`value ${data.projects.overdue ? "health-text-RED" : ""}`}>
            {data.projects.overdue}/{data.projects.open}
          </div>
          <div className="label">Projetos em atraso / abertos</div>
        </div>
      </div>

      {data.me?.scorecard && (
        <div className="card">
          <h3 className="card-title">A minha performance</h3>
          <div className="card-grid">
            <div className="stat">
              <div className="value">
                <ScoreValue score={data.me.scorecard.score} health={data.me.scorecard.health} />
              </div>
              <div className="label">Nota final</div>
            </div>
            <div className="stat">
              <div className="value">{fmt(data.me.scorecard.kpiScore)}</div>
              <div className="label">KPIs ({data.me.scorecard.kpiCount})</div>
            </div>
            <div className="stat">
              <div className="value">{fmt(data.me.scorecard.objectiveScore)}</div>
              <div className="label">Ritmo dos objetivos ({data.me.scorecard.objectiveCount})</div>
            </div>
            <div className="stat">
              <div className="value">{fmt(data.me.scorecard.deliveryScore)}</div>
              <div className="label">Entrega no prazo</div>
            </div>
            <div className="stat">
              <div className={`value ${data.me.scorecard.overdueTasks ? "health-text-RED" : ""}`}>
                {data.me.scorecard.overdueTasks}/{data.me.scorecard.openTasks}
              </div>
              <div className="label">Tarefas em atraso / abertas</div>
            </div>
          </div>
        </div>
      )}

      {data.strategicObjectives.length > 0 && (
        <div className="card">
          <div className="page-header" style={{ marginBottom: "0.6rem" }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              Objetivos estratégicos
            </h3>
            <Link to="/objetivos">Ver cascata de objetivos</Link>
          </div>
          <div className="objective-cards">
            {data.strategicObjectives.map((o) => (
              <div key={o.id} className="objective-card">
                <strong>{o.title}</strong>
                <ProgressBar value={o.progress} health={TIMING_HEALTH[o.schedule.timing]} />
                <div className="hint">
                  {o.progress}% · prazo {formatDate(o.dueDate)} · {o.childCount} objetivo(s) de direção
                </div>
                <div>
                  <TimingBadge timing={o.schedule.timing} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.departments.length > 0 && (
        <div className="card">
          <h3 className="card-title">Departamentos e KPIs</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Departamento</th>
                  <th>Responsável</th>
                  <th className="num">KPIs</th>
                  <th className="num">Objetivos</th>
                  <th className="num">Entrega</th>
                  <th className="num">Nota própria</th>
                  <th className="num">Consolidada</th>
                  <th>Situação</th>
                  <th className="num">KPIs críticos</th>
                  <th className="num">Tarefas atrasadas</th>
                </tr>
              </thead>
              <tbody>
                {departmentTree(data.departments).map(({ department: d, depth }) => (
                  <tr key={d.id}>
                    <td style={{ paddingLeft: `${0.7 + depth * 1.2}rem` }}>
                      <strong>{d.code}</strong> <span className="hint">{d.name}</span>
                    </td>
                    <td>{d.head?.fullName ?? <span className="hint">—</span>}</td>
                    <td className="num">{fmt(d.scorecard.kpiScore)}</td>
                    <td className="num">{fmt(d.scorecard.objectiveScore)}</td>
                    <td className="num">{fmt(d.scorecard.deliveryScore)}</td>
                    <td className="num">
                      <ScoreValue score={d.scorecard.score} health={d.scorecard.health} />
                    </td>
                    <td className="num">
                      <ScoreValue score={d.consolidatedScore} health={d.consolidatedHealth} />
                    </td>
                    <td>
                      <HealthBadge health={d.consolidatedHealth} />
                    </td>
                    <td className="num">{d.scorecard.kpisRed || "-"}</td>
                    <td className="num">{d.scorecard.overdueTasks || "-"}</td>
                  </tr>
                ))}
                {data.departments.length === 0 && (
                  <tr>
                    <td colSpan={10} className="hint">
                      Nenhum departamento cadastrado. Comece em <Link to="/equipa">Equipa</Link>.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.leaders.length > 0 && (
        <div className="card">
          <h3 className="card-title">Gestores e coordenadores</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nome</th>
                  <th>Cargo</th>
                  <th>Departamento</th>
                  <th className="num">KPIs</th>
                  <th className="num">Objetivos</th>
                  <th className="num">Entrega</th>
                  <th className="num">Nota</th>
                  <th>Situação</th>
                  <th className="num">Tarefas abertas</th>
                  <th className="num">Em atraso</th>
                </tr>
              </thead>
              <tbody>
                {data.leaders.map((p, i) => (
                  <tr key={p.id}>
                    <td className="hint">{i + 1}</td>
                    <td>{p.fullName}</td>
                    <td>{ROLE_LABEL[p.role]}</td>
                    <td>{p.department?.code ?? "-"}</td>
                    <td className="num">{fmt(p.scorecard?.kpiScore)}</td>
                    <td className="num">{fmt(p.scorecard?.objectiveScore)}</td>
                    <td className="num">{fmt(p.scorecard?.deliveryScore)}</td>
                    <td className="num">
                      <ScoreValue score={p.scorecard?.score ?? null} health={p.scorecard?.health ?? "NO_DATA"} />
                    </td>
                    <td>
                      <HealthBadge health={p.scorecard?.health ?? "NO_DATA"} />
                    </td>
                    <td className="num">{p.scorecard?.openTasks ?? 0}</td>
                    <td className={`num ${p.scorecard?.overdueTasks ? "health-text-RED" : ""}`}>
                      {p.scorecard?.overdueTasks || "-"}
                    </td>
                  </tr>
                ))}
                {data.leaders.length === 0 && (
                  <tr>
                    <td colSpan={11} className="hint">
                      Nenhum diretor, gestor ou coordenador cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Nota = 50% atingimento dos KPIs (ponderado pelo peso, máx. 120%) + 20% ritmo dos objetivos (progresso face
            ao tempo decorrido) + 30% entrega de tarefas nos últimos 90 dias (no prazo = 100, com atraso = 50, em atraso
            = 0). Sem um dos componentes, os outros são reponderados. Verde ≥ 90, amarelo ≥ 70, vermelho abaixo de 70.
          </p>
        </div>
      )}

      <div className="card">
        <div className="page-header" style={{ marginBottom: "0.6rem" }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            Alertas prioritários {critical > 0 && <span className="badge health-RED">{critical} críticos</span>}
          </h3>
          <Link to="/alertas">Ver todos ({data.alerts.length})</Link>
        </div>
        <AlertList alerts={data.alerts.slice(0, 8)} />
      </div>
    </div>
  );
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toFixed(0);
}

function sum(values: (number | undefined)[]): number {
  return values.reduce<number>((a, b) => a + (b ?? 0), 0);
}

function average(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}
