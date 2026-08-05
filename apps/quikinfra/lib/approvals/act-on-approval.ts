/**
 * actOnApproval — canonical helper for "approve / reject / return"
 * actions on a workflow-driven approval instance.
 *
 * Used by approve routes whose entities have NO final-approve side
 * effects beyond their own status fields (Stock Transfer, Estimation,
 * Work Order, Gate Pass, Purchase Indent). Routes that post to ledgers
 * or trigger external state on final approve (Material Issue stock
 * outward, GRN stock inward, DPR BOQ progress, RAB BOQ billing, Good
 * Return vendor return, PR auto-MI creation) keep their inline
 * implementations because their side-effect logic is too entwined with
 * the approval txn to lift cleanly into a generic callback.
 *
 * The helper handles:
 *   1. action / comments validation
 *   2. approval instance lookup + pending-status gate
 *   3. current step lookup + canActOnStep auth check (with the same
 *      "Expected: <pinned name> | role X assigned to this project"
 *      error string the inline routes used)
 *   4. next-step lookahead
 *   5. inside one transaction: history row + instance status update +
 *      caller-supplied entity-status patch
 *   6. returns refreshed instance metadata so the route can build its
 *      response in its own shape (`{ ok, action, <entityKey>, approval }`)
 *
 * The caller is responsible only for:
 *   - resolving the entity (with id, approvalId, projectId)
 *   - knowing which entity-specific status fields to patch on each
 *     phase (`final-approve` / `reject` / `return`)
 *   - shaping the response body for its UI clients
 */

import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { findCnUsersByIds } from "@/lib/users/lookup";
import type { TenantContext } from "@/lib/auth/context";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import { resolveEffectiveStep } from "@/lib/approvals/step-resolution";
import {
  completeRepairedApproval,
  repointNote,
} from "@/lib/approvals/complete-repaired-approval";

export type ApprovalAction = "approve" | "reject" | "return" | "complete";

export type ApprovalPhase =
  | "intermediate-approve"
  | "final-approve"
  | "reject"
  | "return";

export interface ActOnApprovalInput {
  ctx: TenantContext;
  /**
   * The entity that points at the approval instance via `approvalId`.
   * `projectId` is used by `canActOnStep` to project-scope role-based
   * approvers (pass `null` for entities that aren't project-scoped).
   */
  entity: {
    id: string;
    approvalId: string | null;
    projectId: string | null;
  };
  /**
   * Human-readable label inserted into error messages — e.g.
   * `"estimation"`, `"stock transfer"`, `"work order"`. Becomes
   * `"Cannot ${action} this ${entityLabel}"`.
   */
  entityLabel: string;
  action: ApprovalAction;
  comments: string;
  /**
   * Apply entity-specific status fields. Runs inside the same Prisma
   * transaction as the history-row insert and the instance update, so
   * everything is atomic. Skip the patch in `intermediate-approve` if
   * the entity should stay on its current status (most entities do).
   */
  applyEntityPatch: (
    tx: Prisma.TransactionClient,
    args: { phase: ApprovalPhase; comments: string },
  ) => Promise<void>;
}

export interface ActOnApprovalSuccess {
  kind: "ok";
  /** New status of the approval instance after this action. */
  newInstanceStatus: "pending_approval" | "approved" | "rejected" | "returned";
  /** New currentStepOrder on the instance. */
  newCurrentStepOrder: number;
  /** Total step count on the instance's workflow — useful for UI progress. */
  totalSteps: number;
  instanceId: string;
}

export interface ActOnApprovalError {
  kind: "error";
  status: number;
  body: { error: string };
}

export type ActOnApprovalOutcome = ActOnApprovalSuccess | ActOnApprovalError;

export async function actOnApproval(
  input: ActOnApprovalInput,
): Promise<ActOnApprovalOutcome> {
  const { ctx, entity, entityLabel, action, comments } = input;

  if (!["approve", "reject", "return", "complete"].includes(action)) {
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

  if (!entity.approvalId) {
    return {
      kind: "error",
      status: 400,
      body: {
        error: `This ${entityLabel} was not submitted through a workflow — no approval instance exists.`,
      },
    };
  }

  const instance = await db.cnApprovalInstance.findFirst({
    where: { id: entity.approvalId, orgId: ctx.orgId },
  });
  if (!instance) {
    return {
      kind: "error",
      status: 404,
      body: { error: "Approval instance not found" },
    };
  }
  if (instance.status !== "pending_approval") {
    return {
      kind: "error",
      status: 409,
      body: {
        error: `Approval already ${instance.status} — no further actions allowed.`,
      },
    };
  }

  if (action === "complete") {
    return await completeRepairedApproval({
      ctx,
      instance,
      entityLabel,
      reason: comments,
      applyEntityPatch: input.applyEntityPatch,
    });
  }

  // The instance may be parked on a stepOrder the workflow no longer has
  // (a mid-flight edit removed it). Fall back to the highest surviving step
  // below it rather than dead-ending the request — see step-resolution.ts.
  const resolved = await resolveEffectiveStep(db, instance);
  const currentStep = resolved.step;
  if (!currentStep) {
    return {
      kind: "error",
      status: 500,
      body: {
        error: `Workflow for this ${entityLabel} has no steps configured — it cannot be actioned. Reconfigure the workflow under Settings → Workflows.`,
      },
    };
  }
  const actingStepOrder = resolved.effectiveStepOrder;

  if (
    !canActOnStep(
      { userId: ctx.userId, roleKey: ctx.roleKey, projectIds: ctx.projectIds },
      {
        approverUserId: currentStep.approverUserId,
        approverUserIds: Array.isArray(currentStep.approverUserIds)
          ? currentStep.approverUserIds
          : null,
        approverRoleId: currentStep.approverRoleId,
      },
      entity.projectId,
    )
  ) {
    // Surface a useful "expected approver" message. With a pool of
    // multiple users we resolve all their names and join them so the
    // rejected actor sees "Expected: yash, bhavna" rather than a single
    // pinned name that doesn't match what they configured.
    const poolIds: string[] = Array.isArray(currentStep.approverUserIds)
      ? currentStep.approverUserIds
      : [];
    const effectivePool =
      poolIds.length > 0
        ? poolIds
        : currentStep.approverUserId
          ? [currentStep.approverUserId]
          : [];
    let expected = "an authorized approver";
    if (effectivePool.length > 0) {
      const pinned = await findCnUsersByIds(effectivePool);
      const names = effectivePool
        .map((id: string) =>
          pinned.find((p) => p.id === id)?.fullName ?? null,
        )
        .filter(Boolean);
      expected =
        names.length > 0
          ? `${names.join(", ")} (eligible approver${names.length === 1 ? "" : "s"})`
          : "the pinned approver(s) for this step";
    } else if (currentStep.approverRoleId) {
      expected =
        `a user with role "${currentStep.approverRoleId}"` +
        (entity.projectId ? ` assigned to this project` : "");
    }
    return {
      kind: "error",
      status: 403,
      body: {
        error: `You are not authorized to ${action} this ${entityLabel} at step ${actingStepOrder}. Expected: ${expected}.`,
      },
    };
  }

  // Derived from the instance's own chain, not a fresh query — a snapshotted
  // instance must advance through the steps it was submitted under.
  const nextStep =
    resolved.steps.find((s) => s.stepOrder > actingStepOrder) ?? null;

  let phase: ApprovalPhase;
  if (action === "approve") {
    phase = nextStep ? "intermediate-approve" : "final-approve";
  } else if (action === "reject") {
    phase = "reject";
  } else {
    phase = "return";
  }

  await db.$transaction(async (tx) => {
    await tx.cnApprovalHistory.create({
      data: {
        instanceId: instance.id,
        stepOrder: actingStepOrder,
        action,
        actionById: ctx.userId,
        // Write the timestamp app-side (UTC) instead of relying on the DB
        // `@default(now())`. The Postgres server clock lands in a tz-naive
        // column and, when the DB session isn't UTC, drifts by the session
        // offset — leaving approval-history times out of sync with the
        // app-written createdAt/updatedAt. new Date() keeps them consistent.
        actionAt: new Date(),
        comments: resolved.repointed
          ? repointNote({
              parkedStepOrder: instance.currentStepOrder,
              actedStepOrder: actingStepOrder,
              comments,
            })
          : comments || null,
      },
    });

    if (phase === "intermediate-approve") {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: { currentStepOrder: nextStep!.stepOrder },
      });
    } else if (phase === "final-approve") {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: {
          status: "approved",
          completedAt: new Date(),
          // Land the instance on the step actually actioned — a repointed
          // instance would otherwise keep a currentStepOrder that no
          // workflow step matches, and every later read re-derives the
          // fallback for nothing.
          currentStepOrder: actingStepOrder,
        },
      });
    } else if (phase === "reject") {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: {
          status: "rejected",
          completedAt: new Date(),
          currentStepOrder: actingStepOrder,
        },
      });
    } else {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: {
          status: "returned",
          completedAt: new Date(),
          currentStepOrder: actingStepOrder,
        },
      });
    }

    await input.applyEntityPatch(tx, { phase, comments });
  });

  const totalSteps = resolved.totalSteps;

  let newInstanceStatus: ActOnApprovalSuccess["newInstanceStatus"];
  let newCurrentStepOrder = actingStepOrder;
  if (phase === "intermediate-approve") {
    newInstanceStatus = "pending_approval";
    newCurrentStepOrder = nextStep!.stepOrder;
  } else if (phase === "final-approve") {
    newInstanceStatus = "approved";
  } else if (phase === "reject") {
    newInstanceStatus = "rejected";
  } else {
    newInstanceStatus = "returned";
  }

  return {
    kind: "ok",
    instanceId: instance.id,
    newInstanceStatus,
    newCurrentStepOrder,
    totalSteps,
  };
}
