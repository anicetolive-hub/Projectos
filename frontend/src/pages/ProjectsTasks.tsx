import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/context";
import { perfApi, type ProjectInput, type TaskInput } from "../performance/api";
import { HealthBadge, ProgressBar, TimingBadge } from "../performance/components";
import { notifyDataChanged, useCurrentPersonId, useReloadOnExternalChange } from "../performance/hooks";
import {
  daysLabel,
  formatDate,
  PRIORITY_LABEL,
  PROJECT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  TIMING_HEALTH,
  toDateInput,
} from "../performance/labels";
import type {
  Department,
  Objective,
  Person,
  Priority,
  Project,
  ProjectStatus,
  Task,
  TaskStatus,
} from "../performance/types";

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const emptyProject = {
  name: "",
  description: "",
  priority: "MEDIUM" as Priority,
  status: "PLANNED" as ProjectStatus,
  startDate: today(),
  dueDate: plusDays(30),
  ownerId: "",
  departmentId: "",
  objectiveId: "",
};

const emptyTask = {
  title: "",
  priority: "MEDIUM" as Priority,
  startDate: today(),
  dueDate: plusDays(7),
  projectId: "",
  assigneeId: "",
};

type TaskFilter = "OPEN" | "MINE" | "LATE" | "ALL";

export function ProjectsTasks() {
  const { user } = useAuth();
  const canCreateProject = !!user && (user.isAdmin || user.role !== "STAFF");
  const [projects, setProjects] = useState<Project[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projectForm, setProjectForm] = useState(emptyProject);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [me] = useCurrentPersonId();
  const [taskFilter, setTaskFilter] = useState<TaskFilter>(me ? "MINE" : "OPEN");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    Promise.all([perfApi.projects.list(), perfApi.tasks.list()]).then(([p, t]) => {
      setProjects(p);
      setTasks(t);
    });
  }, []);
  useReloadOnExternalChange(reload);

  useEffect(() => {
    reload();
    perfApi.people.list().then(setPeople);
    perfApi.departments.list().then(setDepartments);
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

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    const data: ProjectInput = {
      ...projectForm,
      ownerId: projectForm.ownerId || null,
      departmentId: projectForm.departmentId || null,
      objectiveId: projectForm.objectiveId || null,
    };
    if (await run(() => perfApi.projects.create(data), "Erro ao criar projeto")) {
      setProjectForm(emptyProject);
      setShowProjectForm(false);
    }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    const data: Partial<TaskInput> = {
      ...taskForm,
      projectId: taskForm.projectId || projectFilter || null,
      assigneeId: taskForm.assigneeId || me || null,
      startDate: taskForm.startDate || null,
    };
    if (await run(() => perfApi.tasks.create(data as TaskInput), "Erro ao criar tarefa")) {
      setTaskForm({ ...emptyTask, projectId: taskForm.projectId });
    }
  }

  const updateTask = (id: string, data: Partial<TaskInput>) =>
    run(() => perfApi.tasks.update(id, data), "Erro ao atualizar tarefa");
  const updateProject = (id: string, data: Partial<ProjectInput>) =>
    run(() => perfApi.projects.update(id, data), "Erro ao atualizar projeto");

  const visibleTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (projectFilter && t.projectId !== projectFilter) return false;
        const open = t.status !== "DONE" && t.status !== "CANCELLED";
        switch (taskFilter) {
          case "MINE":
            return open && t.assigneeId === me;
          case "LATE":
            return ["OVERDUE", "AT_RISK", "DUE_SOON"].includes(t.schedule.timing);
          case "OPEN":
            return open;
          default:
            return true;
        }
      }),
    [tasks, projectFilter, taskFilter, me],
  );

  return (
    <div>
      <div className="page-header">
        <h2>Projetos e tarefas</h2>
        {canCreateProject && (
          <button className="btn" onClick={() => setShowProjectForm((v) => !v)}>
            {showProjectForm ? "Fechar" : "Novo projeto"}
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showProjectForm && (
        <form className="card" onSubmit={createProject}>
          <div className="form-grid">
            <label className="form-field">
              Nome do projeto
              <input
                required
                value={projectForm.name}
                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
              />
            </label>
            <label className="form-field">
              Responsável
              <PersonSelect
                people={people}
                value={projectForm.ownerId}
                onChange={(ownerId) => setProjectForm({ ...projectForm, ownerId })}
              />
            </label>
            <label className="form-field">
              Departamento
              <select
                value={projectForm.departmentId}
                onChange={(e) => setProjectForm({ ...projectForm, departmentId: e.target.value })}
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Contribui para o objetivo
              <select
                value={projectForm.objectiveId}
                onChange={(e) => setProjectForm({ ...projectForm, objectiveId: e.target.value })}
              >
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
              Prioridade
              <PrioritySelect
                value={projectForm.priority}
                onChange={(priority) => setProjectForm({ ...projectForm, priority })}
              />
            </label>
            <label className="form-field">
              Início
              <input
                type="date"
                required
                value={projectForm.startDate}
                onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })}
              />
            </label>
            <label className="form-field">
              Prazo
              <input
                type="date"
                required
                value={projectForm.dueDate}
                onChange={(e) => setProjectForm({ ...projectForm, dueDate: e.target.value })}
              />
            </label>
          </div>
          <label className="form-field" style={{ marginBottom: "0.8rem" }}>
            Descrição
            <textarea
              rows={2}
              value={projectForm.description}
              onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
            />
          </label>
          <button className="btn" type="submit">
            Criar projeto
          </button>
        </form>
      )}

      <div className="card">
        <h3 className="card-title">Projetos</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Responsável</th>
                <th>Estado</th>
                <th style={{ minWidth: 140 }}>Progresso</th>
                <th>Prazo</th>
                <th>Situação</th>
                <th className="num">Tarefas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className={projectFilter === p.id ? "row-selected" : ""}>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => setProjectFilter(projectFilter === p.id ? "" : p.id)}
                    >
                      {p.name}
                    </button>
                    <div className="hint">
                      {p.department?.code ?? "Sem departamento"} · Prioridade {PRIORITY_LABEL[p.priority].toLowerCase()}
                      {p.objectiveId && ` · Objetivo: ${objectives.find((o) => o.id === p.objectiveId)?.title ?? "—"}`}
                    </div>
                  </td>
                  <td>{p.owner?.fullName ?? "-"}</td>
                  <td>
                    <select
                      value={p.status}
                      onChange={(e) => updateProject(p.id, { status: e.target.value as ProjectStatus })}
                    >
                      {Object.entries(PROJECT_STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <ProgressBar value={p.progress} health={TIMING_HEALTH[p.schedule.timing]} />
                    <span className="hint">{p.progress}%</span>
                  </td>
                  <td>
                    {formatDate(p.dueDate)}
                    {p.status !== "DONE" && p.status !== "CANCELLED" && (
                      <div className="hint">{daysLabel(p.schedule.daysRemaining)}</div>
                    )}
                  </td>
                  <td>
                    <TimingBadge timing={p.schedule.timing} />
                  </td>
                  <td className="num">
                    {p.taskCount - p.openTaskCount}/{p.taskCount}
                    {p.overdueTaskCount > 0 && (
                      <div className="health-text-RED hint">{p.overdueTaskCount} em atraso</div>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn danger"
                      onClick={() =>
                        confirm(`Remover o projeto "${p.name}" e as suas tarefas?`) &&
                        run(() => perfApi.projects.remove(p.id), "Erro ao remover projeto")
                      }
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={8} className="hint">
                    Nenhum projeto cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="hint">Clique no nome de um projeto para ver apenas as suas tarefas.</p>
      </div>

      <div className="card">
        <div className="page-header" style={{ flexWrap: "wrap", gap: "0.6rem" }}>
          <h3 className="card-title" style={{ margin: 0 }}>
            Tarefas
            {projectFilter && (
              <>
                {" "}
                — {projects.find((p) => p.id === projectFilter)?.name}{" "}
                <button className="link-button hint" onClick={() => setProjectFilter("")}>
                  (limpar filtro)
                </button>
              </>
            )}
          </h3>
          <div className="segmented">
            {(
              [
                ["MINE", "As minhas"],
                ["OPEN", "Abertas"],
                ["LATE", "Atrasadas / em risco"],
                ["ALL", "Todas"],
              ] as [TaskFilter, string][]
            ).map(([value, label]) => (
              <button key={value} className={taskFilter === value ? "active" : ""} onClick={() => setTaskFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <form className="inline-form" onSubmit={createTask}>
          <input
            required
            placeholder="Nova tarefa..."
            value={taskForm.title}
            onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
          />
          <select
            value={taskForm.projectId || projectFilter}
            onChange={(e) => setTaskForm({ ...taskForm, projectId: e.target.value })}
          >
            <option value="">Sem projeto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <PersonSelect
            people={people}
            value={taskForm.assigneeId || me}
            onChange={(assigneeId) => setTaskForm({ ...taskForm, assigneeId })}
            placeholder="Responsável"
          />
          <PrioritySelect value={taskForm.priority} onChange={(priority) => setTaskForm({ ...taskForm, priority })} />
          <label className="inline-label">
            Prazo
            <input
              type="date"
              required
              value={taskForm.dueDate}
              onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
            />
          </label>
          <button className="btn" type="submit">
            Adicionar
          </button>
        </form>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Responsável</th>
                <th>Estado</th>
                <th>Progresso</th>
                <th>Prazo</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  people={people}
                  onUpdate={updateTask}
                  onRemove={() => run(() => perfApi.tasks.remove(t.id), "Erro ao remover tarefa")}
                />
              ))}
              {visibleTasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="hint">
                    Nenhuma tarefa neste filtro.
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

function TaskRow({
  task: t,
  people,
  onUpdate,
  onRemove,
}: {
  task: Task;
  people: Person[];
  onUpdate: (id: string, data: Partial<TaskInput>) => void;
  onRemove: () => void;
}) {
  const [progress, setProgress] = useState(t.progress);
  useEffect(() => setProgress(t.progress), [t.progress]);
  const closed = t.status === "DONE" || t.status === "CANCELLED";

  return (
    <tr>
      <td>
        {t.title}
        <div className="hint">
          {t.project?.name ?? "Sem projeto"} · Prioridade {PRIORITY_LABEL[t.priority].toLowerCase()}
        </div>
      </td>
      <td>
        <PersonSelect
          people={people}
          value={t.assigneeId ?? ""}
          onChange={(assigneeId) => onUpdate(t.id, { assigneeId: assigneeId || null })}
        />
      </td>
      <td>
        <select value={t.status} onChange={(e) => onUpdate(t.id, { status: e.target.value as TaskStatus })}>
          {Object.entries(TASK_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </td>
      <td style={{ minWidth: 120 }}>
        {closed ? (
          <span className="hint">{t.status === "DONE" ? `Concluída a ${formatDate(t.completedAt)}` : "-"}</span>
        ) : (
          <>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              onMouseUp={() => progress !== t.progress && onUpdate(t.id, { progress })}
              onKeyUp={() => progress !== t.progress && onUpdate(t.id, { progress })}
              onTouchEnd={() => progress !== t.progress && onUpdate(t.id, { progress })}
            />
            <span className="hint"> {progress}%</span>
          </>
        )}
      </td>
      <td>
        <input
          type="date"
          value={toDateInput(t.dueDate)}
          onChange={(e) => e.target.value && onUpdate(t.id, { dueDate: e.target.value })}
        />
        {!closed && <div className="hint">{daysLabel(t.schedule.daysRemaining)}</div>}
      </td>
      <td>
        {t.status === "CANCELLED" ? (
          <HealthBadge health="NO_DATA" label="Cancelada" />
        ) : (
          <TimingBadge timing={t.schedule.timing} />
        )}
      </td>
      <td>
        <button className="btn danger" onClick={() => confirm(`Remover a tarefa "${t.title}"?`) && onRemove()}>
          ✕
        </button>
      </td>
    </tr>
  );
}

function PersonSelect({
  people,
  value,
  onChange,
  placeholder = "—",
}: {
  people: Person[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {people
        .filter((p) => p.active || p.id === value)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.fullName}
          </option>
        ))}
    </select>
  );
}

function PrioritySelect({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Priority)}>
      {Object.entries(PRIORITY_LABEL).map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
