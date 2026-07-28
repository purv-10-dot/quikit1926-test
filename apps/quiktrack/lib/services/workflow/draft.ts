/**
 * The editor's working document — persisted verbatim in
 * QtWorkflowScheme.draftJson while `hasDraft` is true, and applied to the live
 * QtWorkflow* rows on publish. This is the single contract shared by the read
 * route, the diagram/text editor, and the publish route.
 *
 * Statuses reference existing project QtIssueStatus ids (workflows never own
 * statuses — they select from the project's pool). Transitions carry client
 * ids so the diagram can address them before they exist server-side; publish
 * re-creates real rows.
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §5, §8.
 */
import type { TransitionType } from "./types";
import type { ValidatableGraph } from "./validate-graph";

export interface DraftStatusNode {
  /** QtIssueStatus id (a node in this workflow). */
  statusId: string;
  isInitial: boolean;
  /** Diagram layout (persisted so the editor reopens as arranged). */
  x: number | null;
  y: number | null;
  /** Arbitrary Jira-style status key/value properties. */
  properties?: Record<string, string>;
}

/** A rule attached to a draft transition (recreated as QtWorkflowRule on publish). */
export interface DraftRule {
  kind: "CONDITION" | "VALIDATOR" | "POSTFUNCTION";
  type: string;
  config: Record<string, unknown>;
  errorMessage?: string | null;
  groupNo?: number;
  orderNo?: number;
}

export interface DraftTransition {
  /** Stable client id (cuid-like) — becomes a real row id on publish. */
  id: string;
  name: string;
  type: TransitionType;
  toStatusId: string;
  /** Source status ids ("From statuses"); empty for GLOBAL / INITIAL. */
  fromStatusIds: string[];
  /** Conditions / validators / post-functions on this transition. */
  rules?: DraftRule[];
}

export interface WorkflowDraft {
  /** The live workflow this draft edits. */
  workflowId: string;
  name: string;
  description: string | null;
  statuses: DraftStatusNode[];
  transitions: DraftTransition[];
}

/** Adapt a draft into the shape the pure graph validator consumes. */
export function draftToValidatable(draft: WorkflowDraft): ValidatableGraph {
  return {
    statusIds: draft.statuses.map((s) => s.statusId),
    transitions: draft.transitions.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      toStatusId: t.toStatusId,
      fromStatusIds: t.fromStatusIds,
    })),
  };
}

/** Minimal shape-guard for a draft posted from the client. */
export function isWorkflowDraft(v: unknown): v is WorkflowDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.workflowId === "string" &&
    Array.isArray(d.statuses) &&
    Array.isArray(d.transitions)
  );
}
