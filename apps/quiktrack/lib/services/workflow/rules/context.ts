/**
 * Rule engine context + handler interfaces (Phase 3).
 *
 * Conditions gate transition AVAILABILITY (silent). Validators gate EXECUTION
 * (loud, 422). Post-functions run AFTER the status change inside the commit TX.
 *
 * Handlers receive a RuleContext carrying the issue snapshot, the acting user,
 * the submitted field inputs, and injected async primitives (permission / role
 * checks) so the pure handler logic stays DB-free and unit-testable — the DB
 * lookups are provided by the caller (execute-transition) as closures.
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §2, §6.
 */

/** The issue fields rules read/write. Mutable copy the post-functions update. */
export interface RuleIssueSnapshot {
  id: string;
  orgId: string;
  projectId: string;
  type: string;
  statusId: string;
  assigneeId: string | null;
  resolutionId: string | null;
  priority: string | null;
  // Extra fields the "Restrict to when a field is a specific value" rule can
  // test. Optional so existing snapshot builders/tests keep compiling; the
  // field-value rule treats an absent field as null (never-equal).
  reporterId?: string | null;
  title?: string | null;
  description?: string | null;
  storyPoints?: number | null;
  eta?: number | null;
  /** ISO strings (or null). Date rules parse these to timestamps. */
  dueDate?: string | null;
  startDate?: string | null;
}

/** One recorded status change on a work item (from the transition log). */
export interface TransitionHistoryEntry {
  fromStatusId: string | null;
  toStatusId: string;
  actorId: string | null;
}

/** Injected async primitives (backed by the DB in production, stubs in tests). */
export interface RulePrimitives {
  /** Does the acting user hold (resource, action) in the issue's project? */
  userCanInProject: (resource: string, action: string) => Promise<boolean>;
  /** Is the acting user assigned the named project role in this project? */
  userInProjectRole: (roleName: string) => Promise<boolean>;
  /** Status ids of this work item's (non-deleted) subtasks. Empty if none. */
  subtaskStatusIds: () => Promise<string[]>;
  /**
   * This work item's status changes in chronological order (oldest → newest),
   * from the transition log. Empty when the item has never moved. Used by the
   * "been through a status" and "previous updater" rules.
   */
  transitionHistory: () => Promise<TransitionHistoryEntry[]>;
  /**
   * The status id of this work item's parent, or null when it has no parent.
   * Used by the "validate parent work items are in a specific status" rule.
   */
  parentStatusId: () => Promise<string | null>;
}

export interface RuleContext {
  userId: string;
  /**
   * True when the move is driven by an API/automation actor rather than a human.
   * Undefined today (no API-actor plumbing) — read by restrict_from_all's
   * "allow APIs" mode, which treats undefined as "not an API actor".
   */
  isApiActor?: boolean;
  issue: RuleIssueSnapshot;
  /** The transition being taken (id + target). */
  toStatusId: string;
  /** Category of the target status ("BACKLOG" | "IN_PROGRESS" | "DONE"). */
  toStatusCategory: string;
  /** Field inputs submitted with the transition (e.g. { resolutionId }). */
  inputs: Record<string, unknown>;
  prim: RulePrimitives;
}

/** A configured rule row (from QtWorkflowRule / the draft). */
export interface RuleSpec {
  id: string;
  type: string;
  config: Record<string, unknown>;
  errorMessage?: string | null;
  groupNo: number;
  orderNo: number;
}

export interface ConditionHandler {
  /** True → available. Fails safe (return false) on bad state. */
  evaluate: (ctx: RuleContext, config: Record<string, unknown>) => Promise<boolean>;
  /** Reject bad config at save time (returns a list of error strings). */
  validateConfig?: (config: Record<string, unknown>) => string[];
}

export interface ValidatorFailure {
  field?: string;
  message: string;
}

export interface ValidatorHandler {
  /** Returns a failure, or null when the check passes. */
  validate: (
    ctx: RuleContext,
    config: Record<string, unknown>,
    errorMessage?: string | null,
  ) => Promise<ValidatorFailure | null>;
  validateConfig?: (config: Record<string, unknown>) => string[];
}

/** Post-functions return a partial patch + optional side effects to apply in-txn. */
export interface PostFunctionResult {
  /** Fields to write on the issue (e.g. { resolutionId, assigneeId }). */
  patch?: Partial<Pick<RuleIssueSnapshot, "assigneeId" | "resolutionId" | "priority">>;
  /** Comment bodies to append to the issue (add_comment post-function). */
  comments?: string[];
}

/** The aggregated effects of all post-functions on a transition. */
export interface PostFunctionEffects {
  patch: Partial<Pick<RuleIssueSnapshot, "assigneeId" | "resolutionId" | "priority">>;
  comments: string[];
}

export interface PostFunctionHandler {
  run: (
    ctx: RuleContext,
    config: Record<string, unknown>,
  ) => Promise<PostFunctionResult>;
  validateConfig?: (config: Record<string, unknown>) => string[];
}
