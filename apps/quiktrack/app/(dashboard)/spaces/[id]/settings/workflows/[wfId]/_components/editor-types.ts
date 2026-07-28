/**
 * Client shapes for the workflow editor. The editor works on a WorkflowDraft
 * (statuses reference project QtIssueStatus ids; transitions carry client ids)
 * and saves it to the scheme draft, then publishes.
 */

export type TransitionType = "INITIAL" | "NORMAL" | "GLOBAL";

export interface EditorStatusNode {
  statusId: string;
  isInitial: boolean;
  x: number | null;
  y: number | null;
  properties?: Record<string, string>;
}

export type RuleKind = "CONDITION" | "VALIDATOR" | "POSTFUNCTION";

export interface EditorRule {
  kind: RuleKind;
  type: string;
  config: Record<string, unknown>;
  errorMessage?: string | null;
  groupNo?: number;
  orderNo?: number;
}

export interface EditorTransition {
  id: string;
  name: string;
  type: TransitionType;
  toStatusId: string;
  fromStatusIds: string[];
  rules: EditorRule[];
}

export interface EditorDraft {
  workflowId: string;
  name: string;
  description: string | null;
  statuses: EditorStatusNode[];
  transitions: EditorTransition[];
}

/** Status metadata (from the project pool) used to render nodes. */
export interface StatusMeta {
  id: string;
  name: string;
  color: string;
  category: string;
}

export interface PublishError {
  code: string;
  message: string;
  statusId?: string;
  transitionId?: string;
}

/** The GET /api/workflows/[wfId] response shape (subset the editor needs). */
export interface WorkflowReadModel {
  workflow: {
    id: string;
    projectId: string | null;
    name: string;
    description: string | null;
    isActive: boolean;
    initialTransitionId: string | null;
    workflowStatuses: Array<{
      statusId: string;
      isInitial: boolean;
      x: number | null;
      y: number | null;
      properties: unknown;
      status: StatusMeta;
    }>;
    transitions: Array<{
      id: string;
      name: string;
      type: TransitionType;
      toStatusId: string;
      fromStatuses: Array<{ statusId: string }>;
      rules: Array<{
        id: string;
        kind: RuleKind;
        type: string;
        config: unknown;
        errorMessage: string | null;
        groupNo: number;
        orderNo: number;
      }>;
    }>;
  };
  draft: EditorDraft | null;
}

/** Build an editor draft from the live read-model (used when no draft exists). */
export function draftFromReadModel(rm: WorkflowReadModel): EditorDraft {
  if (rm.draft) return rm.draft;
  const wf = rm.workflow;
  return {
    workflowId: wf.id,
    name: wf.name,
    description: wf.description,
    statuses: wf.workflowStatuses.map((ws, i) => ({
      statusId: ws.statusId,
      isInitial: ws.isInitial,
      // Lay nodes out in a row if they have no saved position yet.
      x: ws.x ?? 80 + i * 200,
      y: ws.y ?? 160,
      properties:
        ws.properties && typeof ws.properties === "object"
          ? (ws.properties as Record<string, string>)
          : undefined,
    })),
    transitions: wf.transitions.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      toStatusId: t.toStatusId,
      fromStatusIds: t.fromStatuses.map((f) => f.statusId),
      rules: (t.rules ?? []).map((r) => ({
        kind: r.kind,
        type: r.type,
        config: (r.config && typeof r.config === "object" ? r.config : {}) as Record<string, unknown>,
        errorMessage: r.errorMessage,
        groupNo: r.groupNo,
        orderNo: r.orderNo,
      })),
    })),
  };
}
