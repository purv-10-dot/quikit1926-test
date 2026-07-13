/**
 * submitForApproval — canonical helper for "draft → pending_approval"
 * transitions across every approval-driven entity (PR, Indent, RFQ, PO,
 * GRN, Estimation, WO, DPR, Stock Transfer, Material Issue, Good
 * Return, Gate Pass).
 *
 * It handles the three things every submit route used to inline:
 *
 *   1. Look up the active workflow for `entityType` and walk its steps.
 *   2. Skip-on-raiser: if the raiser fills the role of the leading
 *      step(s), record those as auto-approved history rows; the first
 *      non-self step becomes the live step.
 *   3. If every step is filled by the raiser, jump straight to the
 *      `autoApprovedInstanceStatus` (default `"approved"`); record every
 *      step as auto-approved history. DPR is the one route that uses
 *      `"pending_approval"` here because its last step is always a
 *      human approver — for that case we record steps[0..n-2] only.
 *
 * The instance + history rows are written in a single Prisma
 * transaction. Callers that need to update the entity row atomically
 * (PR, Indent, RFQ, PO, GRN) pass `onCreatedInTxn` to piggyback their
 * `tx.cnX.update(...)` onto the same transaction. Callers that patch
 * the entity via a post-tx repository helper (Stock Transfer, Material
 * Issue, Good Return, Gate Pass, Work Order, Estimation, DPR) leave
 * `onCreatedInTxn` undefined and run the patch after the helper returns.
 */

import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import {
  isSkippableByRaiser,
  userTypeFromRoleKey,
} from "@/lib/approvals/workflow-rbac";

type WorkflowWithSteps = Prisma.CnApprovalWorkflowGetPayload<{
  include: { steps: true };
}>;
type WorkflowStep = WorkflowWithSteps["steps"][number];

export interface SubmitForApprovalInput {
  ctx: {
    orgId: string;
    userId: string;
    roleKey?: string | null;
  };
  /**
   * Matches `cnApprovalWorkflow.entityType`. Pass an array to try
   * multiple keys in order — used by GRN, which historically accepted
   * both `"grns"` (canonical) and `"grn"` (legacy). The first key with
   * an active workflow wins; if none match, `NoActiveWorkflowError` is
   * thrown.
   */
  entityType: string | readonly string[];
  /**
   * The project the document belongs to. When set, resolution tries to
   * find a project-scoped workflow first (where `projectId` matches);
   * if none exists, it falls back to the tenant-wide Default workflow
   * (where `projectId IS NULL`). Submit routes for project-bound entities
   * (DPR, Work Order, Estimation, PR, Indent, PO, RFQ, GRN, Issue,
   * Transfer, Gate Pass, Good Return) should pass the entity's projectId.
   * Leave `undefined` for tenant-scoped entities (none today, but reserved).
   */
  projectId?: string | null;
  entityId: string;
  /** Display number on the instance — falls back to `entityId` upstream. */
  entityNumber: string;
  /**
   * When the raiser fills every step's role, set the instance to this
   * status. Default `"approved"`. DPR uses `"pending_approval"` because
   * its last step is always a separate human approver.
   */
  autoApprovedInstanceStatus?: "approved" | "pending_approval";
  /**
   * Run inside the same transaction as the instance + history rows.
   * Use this to update the entity row atomically. Receives the
   * transaction client and a small payload describing the result so
   * far — the caller can branch entity-status off `autoApproved`.
   */
  onCreatedInTxn?: (
    tx: Prisma.TransactionClient,
    args: { instanceId: string; autoApproved: boolean },
  ) => Promise<void>;
}

export interface SubmitForApprovalResult {
  instanceId: string;
  autoApproved: boolean;
}

/**
 * Thrown when no active workflow exists for the entityType. Callers
 * surface this as a 400 telling the admin to configure one under
 * Settings → Workflows.
 */
export class NoActiveWorkflowError extends Error {
  constructor(
    public readonly entityType: string,
    public readonly projectId: string | null = null,
  ) {
    super(`No active ${entityType} workflow is configured`);
    this.name = "NoActiveWorkflowError";
  }
}

const COMMENT_AUTO_APPROVED =
  "Auto-approved on submission — raiser is the step's approver";
const COMMENT_AUTO_SKIPPED =
  "Auto-skipped on submission — raiser is this step's approver";

export async function submitForApproval(
  input: SubmitForApprovalInput,
): Promise<SubmitForApprovalResult> {
  const { ctx, entityId, entityNumber } = input;
  const autoApprovedInstanceStatus =
    input.autoApprovedInstanceStatus ?? "approved";

  // Resolve the workflow — try each entityType in order if a list was
  // passed (GRN uses ["grns", "grn"] for legacy compat). First key with
  // an active workflow wins; the matched key is also stored on the
  // resulting instance row so the approve route can find it.
  //
  // Project-scoped resolution only — tenant-wide Default workflows are
  // no longer supported (admins configure approvals per project on the
  // Workflows page). Submissions without a `projectId` therefore have
  // no workflow to match and will throw `NoActiveWorkflowError` below.
  const candidateTypes = Array.isArray(input.entityType)
    ? input.entityType
    : [input.entityType as string];

  let workflow: WorkflowWithSteps | null = null;
  let entityType = candidateTypes[0];
  if (input.projectId != null) {
    for (const t of candidateTypes) {
      const found = await db.cnApprovalWorkflow.findFirst({
        where: {
          orgId: ctx.orgId,
          entityType: t,
          isActive: true,
          projectId: input.projectId,
        },
        include: { steps: { orderBy: { stepOrder: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
      if (found && found.steps.length > 0) {
        workflow = found;
        entityType = t;
        break;
      }
    }
  }

  if (!workflow) {
    throw new NoActiveWorkflowError(candidateTypes[0], input.projectId ?? null);
  }

  const raiser = {
    userId: ctx.userId,
    userType: userTypeFromRoleKey(ctx.roleKey ?? null),
  };

  // Walk the steps from the front; everything the raiser fills is
  // auto-skipped. The first step the raiser does NOT fill becomes
  // the live step.
  const skipped: WorkflowStep[] = [];
  let startStep: WorkflowStep | null = null;
  for (const s of workflow.steps) {
    if (isSkippableByRaiser(s, raiser)) {
      skipped.push(s);
    } else {
      startStep = s;
      break;
    }
  }

  return await db.$transaction(async (tx) => {
    if (!startStep) {
      // Every step is filled by the raiser. The instance jumps to the
      // chosen auto-approved status (or, for DPR, to pending_approval
      // with the last step still live).
      const lastStep = workflow.steps[workflow.steps.length - 1];
      const created = await tx.cnApprovalInstance.create({
        data: {
          orgId: ctx.orgId,
          workflowId: workflow.id,
          entityType,
          entityId,
          entityNumber,
          currentStepOrder: lastStep.stepOrder,
          status: autoApprovedInstanceStatus,
          ...(autoApprovedInstanceStatus === "approved"
            ? { completedAt: new Date() }
            : {}),
          requestedById: ctx.userId,
        },
      });

      // For "approved": every step is recorded as auto-approved.
      // For "pending_approval" (DPR): record steps[0..n-2] — the last
      // step stays live and pending for the human approver.
      const stepsToRecord =
        autoApprovedInstanceStatus === "approved"
          ? workflow.steps
          : workflow.steps.slice(0, -1);

      if (stepsToRecord.length > 0) {
        await tx.cnApprovalHistory.createMany({
          data: stepsToRecord.map((s) => ({
            instanceId: created.id,
            stepOrder: s.stepOrder,
            action: "approve",
            actionById: ctx.userId,
            comments:
              autoApprovedInstanceStatus === "approved"
                ? COMMENT_AUTO_APPROVED
                : COMMENT_AUTO_SKIPPED,
          })),
        });
      }

      const autoApproved = autoApprovedInstanceStatus === "approved";
      await input.onCreatedInTxn?.(tx, { instanceId: created.id, autoApproved });
      return { instanceId: created.id, autoApproved };
    }

    // Normal path — first non-self step is live; a skipped prefix is
    // recorded as auto-approved history.
    const created = await tx.cnApprovalInstance.create({
      data: {
        orgId: ctx.orgId,
        workflowId: workflow.id,
        entityType,
        entityId,
        entityNumber,
        currentStepOrder: startStep.stepOrder,
        status: "pending_approval",
        requestedById: ctx.userId,
      },
    });

    if (skipped.length > 0) {
      await tx.cnApprovalHistory.createMany({
        data: skipped.map((s) => ({
          instanceId: created.id,
          stepOrder: s.stepOrder,
          action: "approve",
          actionById: ctx.userId,
          comments: COMMENT_AUTO_SKIPPED,
        })),
      });
    }

    await input.onCreatedInTxn?.(tx, {
      instanceId: created.id,
      autoApproved: false,
    });
    return { instanceId: created.id, autoApproved: false };
  });
}
