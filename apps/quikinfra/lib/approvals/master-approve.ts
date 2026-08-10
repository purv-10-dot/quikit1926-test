/**
 * Master Approval — the workflow's named fallback approver closing a request.
 *
 * Every step names its approver by pinned user or by role, and the step gate
 * enforces that strictly. When the named approver is on leave, has left, or
 * simply never acts, the request has no legitimate route forward — which is
 * what drove admins to edit live workflows and strand in-flight requests.
 *
 * `CnApprovalWorkflow.masterApproverUserId` names one user who outranks the
 * chain for that workflow. They may close a request from any step, with no
 * waiting period, and any remaining steps are skipped: the master approver is
 * deliberately higher authority than the individual approvers, so re-asking
 * the later steps would defeat the point.
 *
 * The entity's normal final-approve side effects still run, so ledger-posting
 * documents (GRN stock, DPR progress, RAB billing) settle correctly — this is
 * a real final approval performed by a different person, not a status poke.
 *
 * Guards:
 *   - the actor must be the user named on the workflow (no role shortcut)
 *   - they may not close a request they raised themselves — the whole point is
 *     a second pair of eyes when the first is unavailable
 *   - a reason of at least MASTER_APPROVAL_REASON_MIN_LENGTH characters, stored
 *     on the history row so the timeline explains why the chain was short-cut
 *   - the workflow lookup is org-scoped, so a master approver in one org can
 *     never act on another's request
 */

import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/auth/context";
import { resolveEffectiveStep } from "@/lib/approvals/step-resolution";
import {
  MASTER_APPROVAL_MARKER as MARKER,
  MASTER_APPROVAL_SKIP_MARKER as SKIP_MARKER,
} from "@/lib/approvals/history-markers";
import { findCnUserById } from "@/lib/users/lookup";
import {
  claimInstanceForSettlement,
  conflictMessage,
  type ClaimResult,
} from "@/lib/approvals/claim-instance";

/** Minimum reason length. Matches the other reason-bearing approval actions. */
export const MASTER_APPROVAL_REASON_MIN_LENGTH = 20;

export {
  MASTER_APPROVAL_MARKER,
  MASTER_APPROVAL_SKIP_MARKER,
} from "@/lib/approvals/history-markers";

export interface MasterApprovalInstance {
  id: string;
  workflowId: string;
  currentStepOrder: number;
  status: string;
  requestedById: string;
  stepsSnapshot?: Prisma.JsonValue | null;
}

export interface MasterApprovalApproved {
  kind: "ok";
  /** Step the closing history row is recorded against. */
  actingStepOrder: number;
  /** Steps after it that this approval skips — recorded for the timeline. */
  skippedStepOrders: number[];
  /** Steps in the instance's chain. */
  totalSteps: number;
  /** Trimmed, length-validated reason. */
  reason: string;
}

export type MasterApprovalCheck =
  | MasterApprovalApproved
  | { kind: "error"; status: number; body: { error: string } };

/**
 * Run every guard without performing the approval.
 *
 * Exported so the approve routes that own their final-approve transaction (DPR
 * posts BOQ progress + stock, GRN posts stock inward, RAB posts billing) can
 * authorise and then reuse their existing final-approve path, rather than
 * duplicating those side effects here.
 */
export async function validateMasterApproval(input: {
  ctx: TenantContext;
  instance: MasterApprovalInstance;
  entityLabel: string;
  reason: string;
}): Promise<MasterApprovalCheck> {
  const { ctx, instance, entityLabel } = input;
  const reason = input.reason.trim();

  if (instance.status !== "pending_approval") {
    return {
      kind: "error",
      status: 409,
      body: {
        error: `Approval already ${instance.status} — no further actions allowed.`,
      },
    };
  }

  if (reason.length < MASTER_APPROVAL_REASON_MIN_LENGTH) {
    return {
      kind: "error",
      status: 400,
      body: {
        error: `A reason of at least ${MASTER_APPROVAL_REASON_MIN_LENGTH} characters is required to approve this ${entityLabel} as master approver.`,
      },
    };
  }

  const workflow = await db.cnApprovalWorkflow.findFirst({
    where: { id: instance.workflowId, orgId: ctx.orgId },
    select: { masterApproverUserId: true },
  });
  if (!workflow?.masterApproverUserId) {
    return {
      kind: "error",
      status: 403,
      body: {
        error: `No master approver is configured for this ${entityLabel}'s workflow.`,
      },
    };
  }
  if (workflow.masterApproverUserId !== ctx.userId) {
    return {
      kind: "error",
      status: 403,
      body: {
        error: `Only the master approver named on this workflow can approve this ${entityLabel} outside its approval chain.`,
      },
    };
  }
  if (instance.requestedById === ctx.userId) {
    return {
      kind: "error",
      status: 403,
      body: {
        error: `You raised this ${entityLabel}, so you cannot approve it as master approver.`,
      },
    };
  }

  const resolved = await resolveEffectiveStep(db, instance);
  if (!resolved.step) {
    return {
      kind: "error",
      status: 500,
      body: {
        error: `This ${entityLabel}'s workflow has no steps configured, so it cannot be actioned.`,
      },
    };
  }

  return {
    kind: "ok",
    actingStepOrder: resolved.effectiveStepOrder,
    skippedStepOrders: resolved.steps
      .filter((s) => s.stepOrder > resolved.effectiveStepOrder)
      .map((s) => s.stepOrder),
    totalSteps: resolved.totalSteps,
    reason,
  };
}

/** History `comments` for the master approver's own closing row. */
export function masterApprovalComment(args: {
  actingStepOrder: number;
  skippedStepOrders: number[];
  reason: string;
}): string {
  const skipped =
    args.skippedStepOrders.length > 0
      ? ` Remaining step${args.skippedStepOrders.length === 1 ? "" : "s"} ${args.skippedStepOrders.join(", ")} skipped.`
      : "";
  return `${MARKER} Approved at step ${args.actingStepOrder} by the workflow's master approver.${skipped} ${args.reason}`;
}

/** History `comments` for each step the master approval skipped. */
export function masterApprovalSkipComment(actingStepOrder: number): string {
  return `${SKIP_MARKER} Closed by the master approver at step ${actingStepOrder}.`;
}

/**
 * Write the master approval: one history row for the acting step, one per
 * skipped step so the timeline has no silent gaps, then flip the instance to
 * approved and run the entity's own final-approve patch — all in one
 * transaction.
 */
export async function masterApproveRequest(input: {
  ctx: TenantContext;
  instance: MasterApprovalInstance;
  entityLabel: string;
  reason: string;
  applyEntityPatch: (
    tx: Prisma.TransactionClient,
    args: { phase: "final-approve"; comments: string },
  ) => Promise<void>;
}): Promise<
  | {
      kind: "ok";
      instanceId: string;
      newInstanceStatus: "approved";
      newCurrentStepOrder: number;
      totalSteps: number;
    }
  | { kind: "error"; status: number; body: { error: string } }
> {
  const { ctx, instance } = input;

  const check = await validateMasterApproval({
    ctx,
    instance,
    entityLabel: input.entityLabel,
    reason: input.reason,
  });
  if (check.kind === "error") return check;

  const { actingStepOrder, skippedStepOrders, totalSteps, reason } = check;
  const now = new Date();

  const closingStepOrder =
    skippedStepOrders.length > 0
      ? skippedStepOrders[skippedStepOrders.length - 1]
      : actingStepOrder;

  // Claim the row before writing anything. The step's own approver may be
  // acting at the same moment — whoever's conditional UPDATE matches first
  // settles the request, and the loser writes nothing and posts nothing.
  let conflict: ClaimResult["conflict"] | undefined;

  await db.$transaction(async (tx) => {
    const claim = await claimInstanceForSettlement(tx, instance.id, {
      status: "approved",
      completedAt: now,
      // Land on the last step in the chain so the request reads as fully
      // walked rather than parked mid-way.
      currentStepOrder: closingStepOrder,
    });
    if (!claim.claimed) {
      conflict = claim.conflict;
      return;
    }

    await tx.cnApprovalHistory.create({
      data: {
        instanceId: instance.id,
        stepOrder: actingStepOrder,
        action: "approve",
        actionById: ctx.userId,
        actionAt: now,
        comments: masterApprovalComment({
          actingStepOrder,
          skippedStepOrders,
          reason,
        }),
      },
    });

    if (skippedStepOrders.length > 0) {
      await tx.cnApprovalHistory.createMany({
        data: skippedStepOrders.map((stepOrder) => ({
          instanceId: instance.id,
          stepOrder,
          action: "approve",
          actionById: ctx.userId,
          actionAt: now,
          comments: masterApprovalSkipComment(actingStepOrder),
        })),
      });
    }

    await input.applyEntityPatch(tx, {
      phase: "final-approve",
      comments: reason,
    });
  });

  if (conflict) {
    const winner = conflict.byUserId
      ? await findCnUserById(conflict.byUserId)
      : null;
    return {
      kind: "error",
      status: 409,
      body: {
        error: conflictMessage(
          conflict,
          winner?.fullName ?? null,
          input.entityLabel,
        ),
      },
    };
  }

  return {
    kind: "ok",
    instanceId: instance.id,
    newInstanceStatus: "approved",
    newCurrentStepOrder: closingStepOrder,
    totalSteps,
  };
}
