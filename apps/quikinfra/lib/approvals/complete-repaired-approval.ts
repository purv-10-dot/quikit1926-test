/**
 * Admin repair action for an approval its own workflow can no longer advance.
 *
 * When a workflow is edited mid-flight its step rows are replaced. An instance
 * parked on a `stepOrder` that no longer exists falls back to the highest
 * surviving step below it (see step-resolution.ts) — but when *every* surviving
 * step already carries an approval there is nothing left for any approver to
 * act on. Such an instance sits as "Pending Approval" with all its visible
 * steps green, and no user, role, or super admin can move it: the chain the
 * workflow describes is already satisfied.
 *
 * This closes it: status → approved, the entity's normal final-approve side
 * effects run, and the reason is written into approval history.
 *
 * Deliberately narrow so it can't double as an approval bypass:
 *   - admin / super admin only
 *   - a reason of at least COMPLETE_REASON_MIN_LENGTH characters, persisted
 *   - refused unless the instance is orphaned AND fully approved, so any
 *     instance the normal chain could still progress is rejected
 *
 * Shared by `actOnApproval` and by the approve routes whose final-approve side
 * effects are too entwined with their own transaction to lift into a callback
 * (DPR, RAB, GRN, PR, Good Return, Material Issue).
 */

import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/auth/context";
import { userTypeFromRoleKey } from "@/lib/approvals/workflow-rbac";
import { assessInstanceRepair } from "@/lib/approvals/step-resolution";

/**
 * Minimum length of the reason an admin must supply. A reason too short to say
 * anything defeats the point of recording one.
 */
export const COMPLETE_REASON_MIN_LENGTH = 20;

export interface CompleteRepairedApprovalInput {
  ctx: TenantContext;
  /** The pending instance, already loaded and org-scoped by the caller. */
  instance: {
    id: string;
    workflowId: string;
    currentStepOrder: number;
    status: string;
    stepsSnapshot?: Prisma.JsonValue | null;
  };
  /** Label used in error copy — "indent", "DPR", "requisition". */
  entityLabel: string;
  reason: string;
  /**
   * Applies the entity's own final-approve status fields. Runs inside the same
   * transaction as the history row and the instance update.
   */
  applyEntityPatch: (
    tx: Prisma.TransactionClient,
    args: { phase: "final-approve"; comments: string },
  ) => Promise<void>;
}

export type CompleteRepairedApprovalOutcome =
  | {
      kind: "ok";
      instanceId: string;
      newInstanceStatus: "approved";
      newCurrentStepOrder: number;
      totalSteps: number;
    }
  | { kind: "error"; status: number; body: { error: string } };

export interface RepairCompletionApproved {
  kind: "ok";
  /** The step the closing history row is recorded against. */
  closingStep: number;
  /** Steps in the instance's chain, for the history note. */
  totalSteps: number;
  /** Trimmed reason, validated for length. */
  reason: string;
}

export type RepairCompletionCheck =
  | RepairCompletionApproved
  | { kind: "error"; status: number; body: { error: string } };

/**
 * Run every guard for the repair action without performing it.
 *
 * Exported so the approve routes that own their final-approve transaction
 * (DPR posts BOQ progress + stock consumption, GRN posts stock inward, RAB
 * posts billing) can authorise the repair and then reuse their existing
 * final-approve path, instead of duplicating those side effects here.
 */
export async function validateRepairCompletion(input: {
  ctx: TenantContext;
  instance: CompleteRepairedApprovalInput["instance"];
  entityLabel: string;
  reason: string;
}): Promise<RepairCompletionCheck> {
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

  if (reason.length < COMPLETE_REASON_MIN_LENGTH) {
    return {
      kind: "error",
      status: 400,
      body: {
        error: `A reason of at least ${COMPLETE_REASON_MIN_LENGTH} characters is required to complete this ${entityLabel} outside its approval chain.`,
      },
    };
  }

  const actorType = ctx.userType ?? userTypeFromRoleKey(ctx.roleKey);
  if (actorType !== "ADMIN" && actorType !== "SUPER_ADMIN") {
    return {
      kind: "error",
      status: 403,
      body: {
        error: `Only an admin can complete a ${entityLabel} whose workflow steps were removed after submission.`,
      },
    };
  }

  const assessment = await assessInstanceRepair(db, instance);
  if (!assessment.orphaned) {
    return {
      kind: "error",
      status: 409,
      body: {
        error: `This ${entityLabel} is on step ${instance.currentStepOrder}, which still exists in its workflow. Use the normal approve action.`,
      },
    };
  }
  if (!assessment.allStepsApproved || assessment.lastStepOrder === null) {
    return {
      kind: "error",
      status: 409,
      body: {
        error: `This ${entityLabel} still has workflow steps awaiting approval — it cannot be completed. Approve the outstanding steps instead.`,
      },
    };
  }

  return {
    kind: "ok",
    closingStep: assessment.lastStepOrder,
    totalSteps: assessment.totalSteps,
    reason,
  };
}

/**
 * History `comments` for an action taken on a re-pointed step.
 *
 * Without this the timeline shows an approval against a step the request was
 * never on — e.g. parked at step 4, approved at step 2 — with nothing to
 * explain the jump. Reads as data corruption otherwise.
 */
export function repointNote(args: {
  parkedStepOrder: number;
  actedStepOrder: number;
  comments?: string | null;
}): string {
  const note =
    `[Step re-pointed from ${args.parkedStepOrder} to ${args.actedStepOrder} — ` +
    `the workflow was edited after submission and step ${args.parkedStepOrder} ` +
    `no longer exists.]`;
  const rest = (args.comments ?? "").trim();
  return rest ? `${note} ${rest}` : note;
}

/**
 * History `comments` for a repair completion — the marker an auditor greps for.
 */
export function repairHistoryComment(args: {
  missingStepOrder: number;
  totalSteps: number;
  reason: string;
}): string {
  return (
    `[Completed by admin — workflow was edited after submission. ` +
    `Parked on removed step ${args.missingStepOrder}; ` +
    `all ${args.totalSteps} current step(s) already approved.] ${args.reason}`
  );
}

export async function completeRepairedApproval(
  input: CompleteRepairedApprovalInput,
): Promise<CompleteRepairedApprovalOutcome> {
  const { ctx, instance, entityLabel } = input;

  const check = await validateRepairCompletion({
    ctx,
    instance,
    entityLabel,
    reason: input.reason,
  });
  if (check.kind === "error") return check;

  const { closingStep, totalSteps, reason } = check;
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.cnApprovalHistory.create({
      data: {
        instanceId: instance.id,
        stepOrder: closingStep,
        action: "approve",
        actionById: ctx.userId,
        actionAt: now,
        comments: repairHistoryComment({
          missingStepOrder: instance.currentStepOrder,
          totalSteps,
          reason,
        }),
      },
    });
    await tx.cnApprovalInstance.update({
      where: { id: instance.id },
      data: {
        status: "approved",
        completedAt: now,
        currentStepOrder: closingStep,
      },
    });
    await input.applyEntityPatch(tx, {
      phase: "final-approve",
      comments: reason,
    });
  });

  return {
    kind: "ok",
    instanceId: instance.id,
    newInstanceStatus: "approved",
    newCurrentStepOrder: closingStep,
    totalSteps,
  };
}
