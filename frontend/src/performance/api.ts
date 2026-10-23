import { request } from "../api";
import type { Alert, Dashboard, Department, Kpi, KpiMeasurement, Objective, Person, Project, Task } from "./types";

const BASE = "/api/performance";

function crud<T, I>(resource: string) {
  return {
    list: () => request<T[]>(`${BASE}/${resource}`),
    create: (data: I) => request<T>(`${BASE}/${resource}`, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<I>) =>
      request<T>(`${BASE}/${resource}/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`${BASE}/${resource}/${id}`, { method: "DELETE" }),
  };
}

export type DepartmentInput = Pick<Department, "name" | "code" | "description" | "parentId">;
export type PersonInput = Pick<Person, "fullName" | "email" | "jobTitle" | "role" | "departmentId"> & {
  active?: boolean;
  isAdmin?: boolean;
  password?: string;
};
export type KpiInput = Pick<
  Kpi,
  "name" | "description" | "unit" | "direction" | "frequency" | "target" | "warningThreshold" | "weight" | "departmentId" | "ownerId" | "objectiveId"
>;
export type ProjectInput = Pick<
  Project,
  "name" | "description" | "status" | "priority" | "startDate" | "dueDate" | "ownerId" | "departmentId" | "objectiveId"
>;
export type ObjectiveInput = Pick<
  Objective,
  "title" | "description" | "level" | "status" | "weight" | "startDate" | "dueDate" | "parentId" | "departmentId" | "ownerId"
> & { progress?: number };
export type TaskInput = Pick<
  Task,
  "title" | "description" | "status" | "priority" | "progress" | "startDate" | "dueDate" | "projectId" | "assigneeId"
>;

export const perfApi = {
  dashboard: () => request<Dashboard>(`${BASE}/dashboard`),
  alerts: () => request<Alert[]>(`${BASE}/alerts`),
  notifyAlerts: () => request<{ sent: number }>(`${BASE}/alerts/notify`, { method: "POST" }),
  departments: crud<Department, DepartmentInput>("departments"),
  people: crud<Person, PersonInput>("people"),
  kpis: {
    ...crud<Kpi, KpiInput>("kpis"),
    addMeasurement: (id: string, data: { period?: string; value: number; notes?: string }) =>
      request<KpiMeasurement>(`${BASE}/kpis/${id}/measurements`, { method: "POST", body: JSON.stringify(data) }),
    removeMeasurement: (id: string, measurementId: string) =>
      request<void>(`${BASE}/kpis/${id}/measurements/${measurementId}`, { method: "DELETE" }),
  },
  projects: crud<Project, ProjectInput>("projects"),
  objectives: crud<Objective, ObjectiveInput>("objectives"),
  tasks: crud<Task, TaskInput>("tasks"),
};
