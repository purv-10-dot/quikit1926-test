/**
 * Shared authorisation + bookkeeping for approve routes that own their
 * final-approve transaction.
 *
 * `actOnApproval` already does all of this for entities whose final-approve is
 * just a status flip. The ledger-posting entities (GRN stock inward, Material
 * Issue outward, DPR BOQ progress, RAB billing, Good Return vendor return, PO,
 * RFQ, Equipment) can't hand their side effects to a generic callback, so they
 * each re-implemented the same preamble — and each copy drifted: different
 * error strings, no snapshot awareness, no repair fallback, no master approver,
 * and a status read far enough from the transaction that two approvers could
 * both commit.
 *
 * This module is that preamble, once:
 *
 *   gateApprovalAction()  → authorise, resolve the step, decide what the action
 *                           settles to. Returns an error envelope the route can
 *                           return verbatim.
 *   claimAndRecord()      → inside the route's transaction: atomically claim the
 *                           instance and write the history rows. A caller that
 *                           loses the claim writes nothing, so its side effects
 *                           must be skipped.
 *
 * The route keeps only what is genuinely its own: the entity's status fields and
 * its ledger posts.
 */

import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/auth/context";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import { findCnUserById, findCnUsersByIds } from "@/lib/users/lookup";
import { resolveEffectiveStep } from "@/lib/approvals/step-resolution";
import {
  repairHistoryComment,
  repointNote,
  validateRepairCompletion,
} from "@/lib/approvals/complete-repaired-approval";
import {
  masterApprovalComment,
  masterApprovalSkipComment,
  validateMasterApproval,
} from "@/lib/approvals/master-approve";
import {
  claimInstanceForAdvance,
  claimInstanceForSettlement,
  conflictMessage,
  describeSettledInstance,
  type ClaimResult,
} from "@/lib/approvals/claim-instance";

export type GateAction = "approve" | "reject" | "return" | "complete" | "master_approve";

export const GATE_ACTIONS: GateAction[] = [
  "approve",
  "reject",
  "return",
  "complete",
  "master_approve",
];

export interface GateInstance {
  id: string;
  workflowId: string;
  currentStepOrder: number;
  status: string;
  requestedById: string;
  stepsSnapshot?: Prisma.JsonValue | null;
}

export interface ApprovalGate {
  kind: "ok";
  /** Step the history row is written against. */
  actingStepOrder: number;
  /** Next step in the instance's own chain, or null when this action is terminal. */
  nextStepOrder: number | null;
  /**
   * The branch the route should take. `complete` and `master_approve` both run
   * the entity's normal final-approve path — same side effects, different
   * authority — so they arrive here as `"approve"`.
   */
  effectiveAction: "approve" | "reject" | "return";
  /** `effectiveAction === "approve" && nextStepOrder === null`. */
  isFinalApprove: boolean;
  /** Where the instance lands once settled. */
  settledStepOrder: number;
  /** How this action was authorised — for logging / audit fields. */
  via: "direct" | "repair" | "master";
  /** Steps a master approval skips. Empty otherwise. */
  skippedStepOrders: number[];
  /** History `comments` for the row, markers already applied. */
  historyComments: string | null;
}

export type ApprovalGateResult =
  | ApprovalGate
  | { kind: "error"; status: number; body: { error: string } };

/**
 * Authorise the action and work out what it settles to. Performs no writes.
 */
export async function gateApprovalAction(input: {
  ctx: TenantContext;
  instance: GateInstance;
  /** Label used in error copy — "GRN", "RA Bill", "purchase order". */
  entityLabel: string;
  action: GateAction;
  comments: string;
  /** The entity's project, for `canActOnStep`'s project scope. */
  projectId: string | null;
}): Promise<ApprovalGateResult> {
  const { ctx, instance, entityLabel, action, comments, projectId } = input;

  if (!GATE_ACTIONS.includes(action)) {
    return {
      kind: "error",
      status: 400,
      body: { error: `Unknown action: ${action}` },
    };
  }
  if ((action === "reject" || action === "return") && !comments) {
    return {
      kind: "error",
      status: 400,
      body: { error: `Comments are required for ${action} actions` },
    };
  }

  if (instance.status !== "pending_approval") {
    // Name whoever settled it — the step's own approver needs to see that the
    // master approver closed the request, not a bare "already approved".
    const settled = await describeSettledInstance(db, instance.id);
    const winner = settled.byUserId
      ? await findCnUserById(settled.byUserId)
      : null;
    return {
      kind: "error",
      status: 409,
      body: {
        error: conflictMessage(settled, winner?.fullName ?? null, entityLabel),
      },
    };
  }

  // A mid-flight workflow edit can remove the step this instance is parked on.
  // Resolve against the instance's own chain and fall back to the highest
  // surviving step below, rather than dead-ending the request.
  const resolved = await resolveEffectiveStep(db, instance);
  const currentStep = resolved.step;
  if (!currentStep) {
    return {
      kind: "error",
      status: 500,
      body: {
        error:
          `This ${entityLabel}'s workflow has no steps configured, so it cannot be ` +
          `actioned. Reconfigure it under Settings → Workflows.`,
      },
    };
  }

  if (action === "complete") {
    const check = await validateRepairCompletion({
      ctx,
      instance,
      entityLabel,
      reason: comments,
    });
    if (check.kind === "error") return check;
    return {
      kind: "ok",
      actingStepOrder: check.closingStep,
      nextStepOrder: null,
      effectiveAction: "approve",
      isFinalApprove: true,
      settledStepOrder: check.closingStep,
      via: "repair",
      skippedStepOrders: [],
      historyComments: repairHistoryComment({
        missingStepOrder: instance.currentStepOrder,
        totalSteps: check.totalSteps,
        reason: check.reason,
      }),
    };
  }

  if (action === "master_approve") {
    const check = await validateMasterApproval({
      ctx,
      instance,
      entityLabel,
      reason: comments,
    });
    if (check.kind === "error") return check;
    const settledStepOrder =
      check.skippedStepOrders.length > 0
        ? check.skippedStepOrders[check.skippedStepOrders.length - 1]
        : check.actingStepOrder;
    return {
      kind: "ok",
      actingStepOrder: check.actingStepOrder,
      nextStepOrder: null,
      effectiveAction: "approve",
      isFinalApprove: true,
      settledStepOrder,
      via: "master",
      skippedStepOrders: check.skippedStepOrders,
      historyComments: masterApprovalComment({
        actingStepOrder: check.actingStepOrder,
        skippedStepOrders: check.skippedStepOrders,
        reason: check.reason,
      }),
    };
  }

  if (
    !canActOnStep(
      { userId: ctx.userId, roleKey: ctx.roleKey, projectIds: ctx.projectIds },
      {
        approverUserId: currentStep.approverUserId,
        approverUserIds: currentStep.approverUserIds,
        approverRoleId: currentStep.approverRoleId,
      },
      projectId,
    )
  ) {
    return {
      kind: "error",
      status: 403,
      body: {
        error:
          `You are not authorized to ${action} this ${entityLabel} at step ` +
          `${resolved.effectiveStepOrder}. Expected: ${await describeExpectedApprover(currentStep, projectId)}.`,
      },
    };
  }

  const actingStepOrder = resolved.effectiveStepOrder;
  const nextStep =
    action === "approve"
      ? (resolved.steps.find((s) => s.stepOrder > actingStepOrder) ?? null)
      : null;

  return {
    kind: "ok",
    actingStepOrder,
    nextStepOrder: nextStep?.stepOrder ?? null,
    effectiveAction: action,
    isFinalApprove: action === "approve" && nextStep === null,
    settledStepOrder: actingStepOrder,
    via: "direct",
    skippedStepOrders: [],
    historyComments: resolved.repointed
      ? repointNote({
          parkedStepOrder: instance.currentStepOrder,
          actedStepOrder: actingStepOrder,
          comments,
        })
      : comments || null,
  };
}

/**
 * Claim the instance and write the history rows, inside the route's own
 * transaction. Returns `{ claimed: false }` when someone else settled it first —
 * the route must then skip its side effects entirely.
 */
export async function claimAndRecord(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  instance: { id: string },
  gate: ApprovalGate,
): Promise<ClaimResult> {
  const now = new Date();

  const claim =
    gate.effectiveAction === "approve" && gate.nextStepOrder !== null
      ? await claimInstanceForAdvance(tx, instance.id, gate.nextStepOrder)
      : await claimInstanceForSettlement(tx, instance.id, {
          status:
            gate.effectiveAction === "approve"
              ? "approved"
              : gate.effectiveAction === "reject"
                ? "rejected"
                : "returned",
          completedAt: now,
          currentStepOrder: gate.settledStepOrder,
        });
  if (!claim.claimed) return claim;

  await tx.cnApprovalHistory.create({
    data: {
      instanceId: instance.id,
      stepOrder: gate.actingStepOrder,
      action: gate.effectiveAction,
      actionById: ctx.userId,
      actionAt: now,
      comments: gate.historyComments,
    },
  });

  // One row per skipped step so the timeline has no silent gaps.
  if (gate.skippedStepOrders.length > 0) {
    await tx.cnApprovalHistory.createMany({
      data: gate.skippedStepOrders.map((stepOrder) => ({
        instanceId: instance.id,
        stepOrder,
        action: "approve",
        actionById: ctx.userId,
        actionAt: now,
        comments: masterApprovalSkipComment(gate.actingStepOrder),
      })),
    });
  }

  return { claimed: true };
}

/**
 * The 409 body for a route that lost the claim. Kept here so every route
 * produces the same, attributed message.
 */
export async function gateConflictResponse(
  conflict: NonNullable<ClaimResult["conflict"]>,
  entityLabel: string,
): Promise<{ error: string }> {
  const winner = conflict.byUserId
    ? await findCnUserById(conflict.byUserId)
    : null;
  return {
    error: conflictMessage(conflict, winner?.fullName ?? null, entityLabel),
  };
}

/** "Neha Gupta, Sunita Rao (eligible approvers)" / "a user with role …". */
async function describeExpectedApprover(
  step: {
    approverUserId: string | null;
    approverUserIds: string[];
    approverRoleId: string | null;
  },
  projectId: string | null,
): Promise<string> {
  const pool =
    step.approverUserIds.length > 0
      ? step.approverUserIds
      : step.approverUserId
        ? [step.approverUserId]
        : [];
  if (pool.length > 0) {
    const users = await findCnUsersByIds(pool);
    const names = pool
      .map((id) => users.find((u) => u.id === id)?.fullName ?? null)
      .filter((n): n is string => Boolean(n));
    return names.length > 0
      ? `${names.join(", ")} (eligible approver${names.length === 1 ? "" : "s"})`
      : "the pinned approver(s) for this step";
  }
  if (step.approverRoleId) {
    return (
      `a user with role "${step.approverRoleId}"` +
      (projectId ? " assigned to this project" : "")
    );
  }
  return "an authorized approver";
}
