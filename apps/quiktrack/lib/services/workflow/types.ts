/**
 * Workflow engine shared types (Phase 1).
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md.
 */

export type TransitionType = "INITIAL" | "NORMAL" | "GLOBAL";

/**
 * A workflow flattened for graph evaluation. Loaded once per resolve and passed
 * to the pure transition helpers so they stay DB-free (and unit-testable).
 */
export interface WorkflowGraph {
  id: string;
  /** Only PUBLISHED (isActive) workflows gate writes; drafts never do. */
  isActive: boolean;
  transitions: GraphTransition[];
}

/** A rule attached to a transition (condition / validator / post-function). */
export interface GraphRule {
  id: string;
  kind: "CONDITION" | "VALIDATOR" | "POSTFUNCTION";
  type: string;
  config: Record<string, unknown>;
  errorMessage: string | null;
  groupNo: number;
  orderNo: number;
}

export interface GraphTransition {
  id: string;
  name: string;
  type: TransitionType;
  toStatusId: string;
  /** Source statuses for a NORMAL transition; empty for GLOBAL / INITIAL. */
  fromStatusIds: string[];
  /** Attached rules (empty in classic Phase 1 workflows). */
  rules: GraphRule[];
}

/** A move that is legal from a given status (surfaced to the board/switcher). */
export interface AvailableTransition {
  id: string;
  name: string;
  toStatusId: string;
}

/** Thrown by assertTransitionAllowed when a move violates the workflow. */
export class TransitionNotAllowedError extends Error {
  readonly code = "TRANSITION_NOT_ALLOWED";
  constructor(
    public readonly fromStatusId: string | null,
    public readonly toStatusId: string,
  ) {
    super(
      `No transition allowed from status ${fromStatusId ?? "(none)"} to ${toStatusId}`,
    );
    this.name = "TransitionNotAllowedError";
  }
}
