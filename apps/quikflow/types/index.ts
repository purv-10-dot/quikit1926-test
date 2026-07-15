/**
 * Shared domain types for QuikFlow client + server. Kept framework-free so
 * both API routes and React components can import them.
 */

export type WfStatusT = "Draft" | "Active" | "Paused" | "Archived";
export type WfScopeT = "org" | "personal";
export type WfRunStatusT = "running" | "waiting" | "success" | "failed" | "cancelled";
export type WfApprovalStatusT = "pending" | "approved" | "rejected";

export interface WorkflowDTO {
  id: string;
  name: string;
  app: string;
  scope: WfScopeT;
  status: WfStatusT;
  ownerId: string;
  ownerName: string | null;
  triggerLabel: string | null;
  actionLabel: string | null;
  lastRunAt: string | null;
  updatedAt: string;
}

export interface RunDTO {
  id: string;
  workflowId: string;
  workflowName: string;
  status: WfRunStatusT;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface TemplateDTO {
  id: string;
  app: string;
  name: string;
  category: string | null;
  description: string | null;
  triggerLabel: string | null;
  actionLabel: string | null;
}

export interface ConnectionDTO {
  id: string;
  provider: string;
  label: string;
  status: string;
  external: boolean;
  expiresAt: string | null;
}

export interface ApprovalDTO {
  id: string;
  title: string;
  detail: string | null;
  status: WfApprovalStatusT;
  workflowName: string;
  app: string;
  createdAt: string;
}

export interface DashboardSummary {
  activeWorkflows: number;
  newThisMonth: number;
  runsToday: number;
  successRate: number | null;
  needsAttention: { total: number; failed: number; waiting: number };
  recentActivity: {
    id: string;
    workflowName: string;
    status: WfRunStatusT;
    detail: string | null;
    at: string;
  }[];
}

export interface InsightsData {
  runsPerDay: { day: string; count: number }[];
  successRate: { rate: number | null; succeeded: number; failed: number };
  mostActive: { workflowId: string; workflowName: string; app: string; runs: number }[];
}

/** Standard API envelope used by every route. */
export type ApiResult<T> = { success: true; data: T } | { success: false; error: string };
