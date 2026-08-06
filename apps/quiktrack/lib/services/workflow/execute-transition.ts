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
  patch: Partial<Pick<RuleIssueSnapshot, "assigneeId" | "resolutionId" | "priority">>;
  /** Comment bodies from add_comment post-functions (persist in the same txn). */
  comments: string[];
  /** The transition id taken (for the audit log), if gated. */
  transitionId: string | null;
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
