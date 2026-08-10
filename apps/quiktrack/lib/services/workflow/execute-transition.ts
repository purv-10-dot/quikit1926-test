/**
 * The transition execution pipeline (Phase 3), DB-backed. Given an issue and a
 * target status, it:
 *   1. resolves the active workflow + finds the matching transition,
 *   2. checks CONDITIONS (throw 403-style ConditionsFailedError if blocked),
 *   3. runs VALIDATORS (throw 422-style ValidationFailedError with all failures),
 *   4. runs POST-FUNCTIONS and returns the field patch to merge into the update.
 *
 * The caller (move / PATCH route) applies the patch inside its own update +
 * writes the QtIssueTransitionLog row. No published workflow → returns a no-op
 * result (legacy any→any preserved).
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §2, §6.
 */
import { db } from "@/lib/db";
import { userCanInProject } from "@/lib/api/permissions";
import { requiredKeysForScreen } from "../screens/screen-required";
import { isCustomFieldKey } from "../screens/field-registry";
import { findTransition } from "./graph";
import { resolveWorkflowGraph } from "./resolve-workflow";
import { TransitionNotAllowedError } from "./types";
import type { GraphRule } from "./types";
import {
  evaluateConditions,
  runPostFunctions,
  runValidators,
} from "./rules/engine";
import type {
  RuleContext,
  RuleIssueSnapshot,
  RuleSpec,
  ValidatorFailure,
  PostFunctionPatch,
} from "./rules/context";

export class ConditionsFailedError extends Error {
  readonly code = "TRANSITION_CONDITIONS_FAILED";
  constructor() {
    super("You can't make this transition.");
    this.name = "ConditionsFailedError";
  }
}

export class ValidationFailedError extends Error {
  readonly code = "TRANSITION_VALIDATION_FAILED";
  constructor(public readonly failures: ValidatorFailure[]) {
    super(failures.map((f) => f.message).join(" "));
    this.name = "ValidationFailedError";
  }
}

export interface ExecuteResult {
  /** True when a published workflow governed this move (rules ran). */
  gated: boolean;
  /** Field patch from post-functions to merge into the issue update. */
  patch: PostFunctionPatch;
  /** Comment bodies from add_comment post-functions (persist in the same txn). */
  comments: string[];
  /** The transition id taken (for the audit log), if gated. */
  transitionId: string | null;
}

/**
 * Map a post-function patch to a Prisma issue-update fragment. Only the
 * post-function-writable scalar columns; date fields (ISO strings) become Date.
 * `priority` is a non-null column, so a null priority is skipped.
 */
export function postFunctionPatchToPrisma(patch: PostFunctionPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("assigneeId" in patch) out.assigneeId = patch.assigneeId ?? null;
  if ("resolutionId" in patch) out.resolutionId = patch.resolutionId ?? null;
  if ("reporterId" in patch) out.reporterId = patch.reporterId ?? null;
  if (typeof patch.priority === "string") out.priority = patch.priority;
  if ("title" in patch && typeof patch.title === "string") out.title = patch.title;
  if ("description" in patch) out.description = patch.description ?? null;
  if ("storyPoints" in patch) out.storyPoints = patch.storyPoints ?? null;
  if ("eta" in patch) out.eta = patch.eta ?? null;
  if ("dueDate" in patch) out.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
  if ("startDate" in patch) out.startDate = patch.startDate ? new Date(patch.startDate) : null;
  return out;
}

/** Screen field key → issue snapshot key (built-ins only). */
const SCREEN_KEY_TO_SNAPSHOT: Record<string, string> = {
  summary: "title", type: "type", status: "statusId", priority: "priority",
  assignee: "assigneeId", reporter: "reporterId", resolution: "resolutionId",
  description: "description", storyPoints: "storyPoints", eta: "eta",
  dueDate: "dueDate", startDate: "startDate",
};

/**
 * Map "Show a screen" inputs (built-in fields only) to a Prisma issue-update
 * fragment, so values entered in the transition screen persist on the move.
 * Custom-field (cf:*) inputs are not written here (they satisfy the required
 * gate but their value persistence is a later pass). `statusId` is skipped —
 * the move sets it. Numbers/dates are coerced.
 */
export function screenInputsToPrisma(inputs: Record<string, unknown>): Record<string, unknown> {
  const NUMERIC = new Set(["storyPoints", "eta"]);
  const DATE = new Set(["dueDate", "startDate"]);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(inputs)) {
    const col = SCREEN_KEY_TO_SNAPSHOT[key];
    if (!col || col === "statusId" || col === "type") continue;
    if (raw === "" || raw === undefined) continue;
    if (NUMERIC.has(key)) { const n = Number(raw); if (!Number.isNaN(n)) out[col] = n; }
    else if (DATE.has(key)) { out[col] = raw ? new Date(String(raw)) : null; }
    else out[col] = raw === null ? null : String(raw);
  }
  return out;
}

/**
 * A required screen field is "empty" when neither the submitted inputs nor the
 * issue currently holds a value. Custom-field keys (cf:*) only come from inputs.
 */
function screenFieldIsEmpty(
  key: string,
  inputs: Record<string, unknown>,
  issue: RuleIssueSnapshot,
): boolean {
  const notEmpty = (v: unknown) => !(v === null || v === undefined || v === "");
  if (key in inputs) return !notEmpty(inputs[key]);
  if (isCustomFieldKey(key)) return true; // no input for a required custom field
  const snapKey = SCREEN_KEY_TO_SNAPSHOT[key];
  if (!snapKey) return false; // unknown built-in → don't block
  if (snapKey in inputs) return !notEmpty(inputs[snapKey]);
  return !notEmpty((issue as unknown as Record<string, unknown>)[snapKey]);
}

const toRuleSpec = (r: GraphRule): RuleSpec => ({
  id: r.id,
  type: r.type,
  config: r.config,
  errorMessage: r.errorMessage,
  groupNo: r.groupNo,
  orderNo: r.orderNo,
});

/**
 * Run the pipeline for a status change. Throws TransitionNotAllowedError (409),
 * ConditionsFailedError (403), or ValidationFailedError (422) on failure.
 */
export async function executeTransition(params: {
  issue: RuleIssueSnapshot;
  toStatusId: string;
  userId: string;
  inputs?: Record<string, unknown>;
}): Promise<ExecuteResult> {
  const { issue, toStatusId, userId, inputs = {} } = params;
  const noop: ExecuteResult = { gated: false, patch: {}, comments: [], transitionId: null };
  if (issue.statusId === toStatusId) return noop;

  const graph = await resolveWorkflowGraph(issue.projectId, issue.type);
  if (!graph) return noop; // opt-in: no published workflow.

  const transition = findTransition(graph, issue.statusId, toStatusId);
  if (!transition) throw new TransitionNotAllowedError(issue.statusId, toStatusId);

  // Target status category (for resolution/stuck semantics + rule context).
  const target = await db.qtIssueStatus.findUnique({
    where: { id: toStatusId },
    select: { category: true },
  });

  const ctx: RuleContext = {
    userId,
    issue,
    toStatusId,
    toStatusCategory: target?.category ?? "BACKLOG",
    inputs,
    prim: {
      userCanInProject: (resource, action) =>
        userCanInProject(userId, issue.orgId, issue.projectId, resource as never, action as never),
      userInProjectRole: async (roleName) => {
        const assignment = await db.qtProjectUserRole.findUnique({
          where: { projectId_userId: { projectId: issue.projectId, userId } },
          select: { projectRole: { select: { name: true } } },
        });
        return assignment?.projectRole.name === roleName;
      },
      subtaskStatusIds: async () => {
        const kids = await db.qtIssue.findMany({
          where: { parentId: issue.id, isDeleted: false },
          select: { statusId: true },
        });
        return kids.map((k) => k.statusId);
      },
      transitionHistory: async () => {
        const rows = await db.qtIssueTransitionLog.findMany({
          where: { issueId: issue.id },
          orderBy: { createdAt: "asc" },
          select: { fromStatusId: true, toStatusId: true, actorId: true },
        });
        return rows;
      },
      parentStatusId: async () => {
        if (!issue.id) return null;
        const self = await db.qtIssue.findUnique({
          where: { id: issue.id },
          select: { parent: { select: { statusId: true } } },
        });
        return self?.parent?.statusId ?? null;
      },
      projectLeadId: async () => {
        const project = await db.qtProject.findUnique({
          where: { id: issue.projectId },
          select: { leadUserId: true },
        });
        return project?.leadUserId ?? null;
      },
      parentFieldValue: async (key) => {
        if (!issue.id) return null;
        const self = await db.qtIssue.findUnique({
          where: { id: issue.id },
          select: { parent: true },
        });
        const parent = self?.parent as Record<string, unknown> | null | undefined;
        const v = parent ? parent[key] : null;
        return v == null ? null : String(v);
      },
    },
  };

  const conditions = transition.rules.filter((r) => r.kind === "CONDITION").map(toRuleSpec);
  const validators = transition.rules.filter((r) => r.kind === "VALIDATOR").map(toRuleSpec);
  const postFns = transition.rules.filter((r) => r.kind === "POSTFUNCTION").map(toRuleSpec);

  // 2. conditions (availability) — a blocked move should not have been offered.
  if (!(await evaluateConditions(ctx, conditions))) throw new ConditionsFailedError();

  // 3. validators (execution) — abort before any write.
  const failures = await runValidators(ctx, validators);
  if (failures.length > 0) throw new ValidationFailedError(failures);

  // 3b. "Show a screen" gate — the move can't complete until the screen's
  //     required fields have a value (from the submitted inputs or the issue).
  const screenRule = transition.rules.find((r) => r.type === "show_screen");
  const screenId = screenRule ? String(screenRule.config.screenId ?? "") : "";
  if (screenId) {
    const requiredKeys = await requiredKeysForScreen(issue.orgId, screenId);
    const screenFailures = requiredKeys
      .filter((key) => screenFieldIsEmpty(key, inputs, issue))
      .map((key) => ({ field: key, message: `${key} is required on this transition's screen.` }));
    if (screenFailures.length > 0) throw new ValidationFailedError(screenFailures);
  }

  // 4. post-functions — collect the patch + side effects (caller applies both
  //    in the same DB transaction as the status write).
  const effects = await runPostFunctions(ctx, postFns);

  return {
    gated: true,
    patch: effects.patch,
    comments: effects.comments,
    transitionId: transition.id,
  };
}
