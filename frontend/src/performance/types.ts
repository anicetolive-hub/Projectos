export type Health = "GREEN" | "YELLOW" | "RED" | "NO_DATA";
export type Role = "DIRECTOR" | "MANAGER" | "COORDINATOR" | "STAFF";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type KpiDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
export type KpiFrequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type ProjectStatus = "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELLED";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
export type TimingStatus = "DONE_ON_TIME" | "DONE_LATE" | "OVERDUE" | "DUE_SOON" | "AT_RISK" | "ON_TRACK" | "CANCELLED";
export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface Scorecard {
  kpiScore: number | null;
  objectiveScore: number | null;
  deliveryScore: number | null;
  score: number | null;
  health: Health;
  kpiCount: number;
  kpisRed: number;
  objectiveCount: number;
  openTasks: number;
  overdueTasks: number;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  parentId?: string | null;
  head: Person | null;
  memberCount: number;
  scorecard: Scorecard;
  consolidatedScore: number | null;
  consolidatedHealth: Health;
}

export interface Person {
  id: string;
  fullName: string;
  email?: string | null;
  jobTitle?: string | null;
  role: Role;
  departmentId?: string | null;
  department?: { id: string; name: string; code: string } | null;
  active: boolean;
  isAdmin: boolean;
  hasPassword?: boolean;
  scorecard?: Scorecard;
}

export interface KpiMeasurement {
  id: string;
  period: string;
  value: number;
  notes?: string | null;
}

export interface KpiEvaluation {
  latestPeriod: string | null;
  latestValue: number | null;
  attainment: number | null;
  health: Health;
  trend: "UP" | "DOWN" | "STABLE" | null;
  missingLastPeriod: boolean;
  expectedPeriod: string;
}

export interface Kpi {
  id: string;
  name: string;
  description?: string | null;
  unit?: string | null;
  direction: KpiDirection;
  frequency: KpiFrequency;
  target: number;
  warningThreshold: number;
  weight: number;
  departmentId?: string | null;
  ownerId?: string | null;
  objectiveId?: string | null;
  department?: { id: string; name: string; code: string } | null;
  owner?: Person | null;
  measurements: KpiMeasurement[];
  evaluation: KpiEvaluation;
}

export interface ScheduleEvaluation {
  timing: TimingStatus;
  deadline: string;
  daysRemaining: number;
  elapsedPct: number | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  priority: Priority;
  startDate: string;
  dueDate: string;
  completedAt?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  objectiveId?: string | null;
  owner?: Person | null;
  department?: { id: string; name: string; code: string } | null;
  progress: number;
  schedule: ScheduleEvaluation;
  taskCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  startDate?: string | null;
  dueDate: string;
  completedAt?: string | null;
  projectId?: string | null;
  assigneeId?: string | null;
  project?: { id: string; name: string } | null;
  assignee?: Person | null;
  schedule: ScheduleEvaluation;
}

export interface Alert {
  key: string;
  severity: AlertSeverity;
  category: "TASK" | "PROJECT" | "KPI" | "OBJECTIVE";
  entityId: string;
  title: string;
  message: string;
  ownerId?: string | null;
  ownerName?: string | null;
  dueDate?: string;
}

export type ObjectiveLevel = "STRATEGIC" | "DIRECTION" | "INDIVIDUAL";
export type ObjectiveStatus = "ACTIVE" | "ACHIEVED" | "CANCELLED";

export interface Objective {
  id: string;
  title: string;
  description?: string | null;
  level: ObjectiveLevel;
  status: ObjectiveStatus;
  weight: number;
  progress: number; // calculado
  manualProgress: number;
  progressSource: "LINKED" | "MANUAL";
  startDate: string;
  dueDate: string;
  achievedAt?: string | null;
  parentId?: string | null;
  departmentId?: string | null;
  ownerId?: string | null;
  owner?: Person | null;
  department?: { id: string; name: string; code: string } | null;
  schedule: ScheduleEvaluation;
  paceScore: number | null;
  kpiCount: number;
  projectCount: number;
  childCount: number;
}

export interface Dashboard {
  generatedAt: string;
  me: Person | null;
  strategicObjectives: Objective[];
  departments: Department[];
  leaders: Person[];
  kpiHealth: Partial<Record<Health, number>>;
  taskTiming: Partial<Record<TimingStatus, number>>;
  projects: { open: number; overdue: number; atRisk: number };
  alerts: Alert[];
}
