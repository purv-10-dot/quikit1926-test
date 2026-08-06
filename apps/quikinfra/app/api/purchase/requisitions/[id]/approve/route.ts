import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { findCnUserById } from "@/lib/users/lookup";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenantCreate, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { findPRById } from "@/lib/purchase/pr-repository";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
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

/**
 * POST /api/purchase/requisitions/:id/approve
 *
 * Workflow-driven approval. The PR carries `approvalId` pointing at its
 * `CnApprovalInstance`. On each action we:
 *
 *   1. Validate the current user is the expected actor for the instance's
 *      current step — pinned-user match, or any caller whose role rank
 *      is >= the step's required role (project-scoped when site-bound).
 *   2. Record a history row inside a txn.
 *   3. On "approve": advance to next step, or mark the instance + PR as
 *      approved if this was the final step. The final-step branch keeps
 *      the existing Material Issue auto-create behaviour for PRs whose
 *      stock check is ALL_AVAILABLE.
 *   4. On "reject" / "return": mark the instance + PR accordingly.
 *
 * Body: { action: "approve" | "reject" | "return", comments?, sourceLocationId? }
 */

type Action = "approve" | "reject" | "return" | "complete" | "master_approve";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.pr", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "purchase.mr", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.mr`, 403);
  }

  let body: { action?: string; comments?: string; sourceLocationId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const action = (body.action ?? "approve") as Action;
  const comments = String(body.comments ?? "").trim();
  const sourceLocationId: string = body?.sourceLocationId ?? "";

  if (
    !["approve", "reject", "return", "complete", "master_approve"].includes(
      action,
    )
  ) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
  if ((action === "reject" || action === "return") && !comments) {
    return NextResponse.json(
      { error: `Comments are required for ${action} actions` },
      { status: 400 },
    );
  }

  const pr = await findPRById(ctx.orgId, params.id);
  if (!pr) return NextResponse.json({ error: "PR not found" }, { status: 404 });
  if (!pr.approvalId) {
    return NextResponse.json(
      { error: "This PR was not submitted through a workflow — no approval instance exists." },
      { status: 400 },
    );
  }

  const instance = await db.cnApprovalInstance.findFirst({
    where: { id: pr.approvalId, orgId: ctx.orgId },
  });
  if (!instance) {
    return NextResponse.json({ error: "Approval instance not found" }, { status: 404 });
  }
  if (instance.status !== "pending_approval") {
    // Name whoever settled it — the step's own approver needs to see that the
    // master approver closed the request, not a bare "already approved".
    const settled = await describeSettledInstance(db, instance.id);
    const winner = settled.byUserId
      ? await findCnUserById(settled.byUserId)
      : null;
    return NextResponse.json(
      { error: conflictMessage(settled, winner?.fullName ?? null, "PR") },
      { status: 409 },
    );
  }

  // Resolve against the instance's own chain (its submit-time snapshot when it
  // has one), falling back to the highest surviving step below when a workflow
  // edit removed the one it is parked on. The old hard 500 fired before the
  // actor check, so nobody could action the PR at all.
  const resolved = await resolveEffectiveStep(db, instance);
  const currentStep = resolved.step;
  if (!currentStep) {
    return NextResponse.json(
      {
        error:
          "This PR's workflow has no steps configured, so it cannot be actioned. " +
          "Reconfigure it under Settings → Workflows.",
      },
      { status: 500 },
    );
  }

  // `complete` closes an instance whose chain is already fully approved — no
  // approver has anything left to act on. Authorised here, then routed through
  // the normal final-approve branch so the PR's own side effects (status flip,
  // auto Material Issue) still run exactly once.
  let repair: { closingStep: number; totalSteps: number; reason: string } | null =
    null;
  if (action === "complete") {
    const check = await validateRepairCompletion({
      ctx,
      instance,
      entityLabel: "PR",
      reason: comments,
    });
    if (check.kind === "error") {
      return NextResponse.json(check.body, { status: check.status });
    }
    repair = {
      closingStep: check.closingStep,
      totalSteps: check.totalSteps,
      reason: check.reason,
    };
  }

  // Master approval outranks the chain: it closes the PR from whatever step it
  // sits on and skips the rest. Authorised here, then routed through the normal
  // final-approve branch so the PR's own side effects still run exactly once.
  let master: {
    actingStepOrder: number;
    skippedStepOrders: number[];
    reason: string;
  } | null = null;
  if (action === "master_approve") {
    const check = await validateMasterApproval({
      ctx,
      instance,
      entityLabel: "PR",
      reason: comments,
    });
    if (check.kind === "error") {
      return NextResponse.json(check.body, { status: check.status });
    }
    master = {
      actingStepOrder: check.actingStepOrder,
      skippedStepOrders: check.skippedStepOrders,
      reason: check.reason,
    };
  }

  if (
    !repair &&
    !master &&
    !canActOnStep(
      { userId: ctx.userId, roleKey: ctx.roleKey, projectIds: ctx.projectIds },
      {
        approverUserId: currentStep.approverUserId,
        approverRoleId: currentStep.approverRoleId,
      },
      pr.projectId ?? null,
    )
  ) {
    // Surface the expected approver so the user knows which account to
    // log in as. Pinned user wins over role.
    let expected = "an authorized approver";
    if (currentStep.approverUserId) {
      const pinned = await findCnUserById(currentStep.approverUserId);
      expected = pinned?.fullName
        ? `${pinned.fullName} (pinned approver)`
        : "the pinned approver for this step";
    } else if (currentStep.approverRoleId) {
      expected =
        `a user with role "${currentStep.approverRoleId}"` +
        (pr.projectId ? ` assigned to this project` : "");
    }
    return NextResponse.json(
      {
        error: `You are not authorized to ${action} this PR at step ${resolved.effectiveStepOrder}. Expected: ${expected}.`,
      },
      { status: 403 },
    );
  }

  // The step the history row is written against.
  const actingStepOrder =
    repair?.closingStep ?? master?.actingStepOrder ?? resolved.effectiveStepOrder;

  // Next step by ascending stepOrder within the instance's own chain, so
  // approvals follow the admin's actual numbering even if it's non-contiguous
  // (e.g. [1,3,5]). Both a repair and a master approval are terminal.
  const nextStep =
    repair || master
      ? null
      : (resolved.steps.find((s) => s.stepOrder > actingStepOrder) ?? null);

  // Both take the approve branch: same side effects, different authority.
  const effectiveAction: Action = repair || master ? "approve" : action;

  const summary = String(pr.stockCheckSummary ?? "").toUpperCase();
  const finalPRStatusOnApprove =
    summary === "ALL_AVAILABLE" ? "approved_stock_available" : "approved_indent_required";

  let finalPRStatus: string | null = null;

  // Settled step order for the terminal branches — after a master approval the
  // instance lands on the last step in the chain, so the request reads as fully
  // walked rather than parked mid-way.
  const settledStepOrder =
    master && master.skippedStepOrders.length > 0
      ? master.skippedStepOrders[master.skippedStepOrders.length - 1]
      : actingStepOrder;

  // Claimed before any write. The step's own approver and the master approver
  // can both be entitled to act right now; without this both transactions
  // commit and the PR ends up with two auto-created Material Issues.
  let conflict: ClaimResult["conflict"] | undefined;

  await db.$transaction(async (tx) => {
    const claim =
      effectiveAction === "approve" && nextStep
        ? await claimInstanceForAdvance(tx, instance.id, nextStep.stepOrder)
        : await claimInstanceForSettlement(tx, instance.id, {
            status:
              effectiveAction === "approve"
                ? "approved"
                : effectiveAction === "reject"
                  ? "rejected"
                  : "returned",
            completedAt: new Date(),
            currentStepOrder: settledStepOrder,
          });
    if (!claim.claimed) {
      conflict = claim.conflict;
      return;
    }

    await tx.cnApprovalHistory.create({
      data: {
        instanceId: instance.id,
        stepOrder: actingStepOrder,
        action: effectiveAction,
        actionById: ctx.userId,
        comments: repair
          ? repairHistoryComment({
              missingStepOrder: instance.currentStepOrder,
              totalSteps: repair.totalSteps,
              reason: repair.reason,
            })
          : master
            ? masterApprovalComment({
                actingStepOrder,
                skippedStepOrders: master.skippedStepOrders,
                reason: master.reason,
              })
            : resolved.repointed
              ? repointNote({
                  parkedStepOrder: instance.currentStepOrder,
                  actedStepOrder: actingStepOrder,
                  comments,
                })
              : comments || null,
      },
    });

    // One row per skipped step so the timeline has no silent gaps.
    if (master && master.skippedStepOrders.length > 0) {
      await tx.cnApprovalHistory.createMany({
        data: master.skippedStepOrders.map((stepOrder) => ({
          instanceId: instance.id,
          stepOrder,
          action: "approve",
          actionById: ctx.userId,
          comments: masterApprovalSkipComment(actingStepOrder),
        })),
      });
    }

    if (effectiveAction === "approve") {
      if (!nextStep) {
        // No step after this one — close the instance and flip the PR.
        await tx.cnPurchaseRequisition.update({
          where: { id: pr.id },
          data: { status: finalPRStatusOnApprove, updatedBy: ctx.userId },
        });
        finalPRStatus = finalPRStatusOnApprove;
      } else {
        // Intermediate step — advance to the next configured step's order.
      }
    } else if (effectiveAction === "reject") {
      await tx.cnPurchaseRequisition.update({
        where: { id: pr.id },
        data: { status: "rejected", updatedBy: ctx.userId },
      });
      finalPRStatus = "rejected";
    } else {
      // "return" — sends the PR back to draft for the requester to edit.
      await tx.cnPurchaseRequisition.update({
        where: { id: pr.id },
        data: { status: "draft", approvalId: null, updatedBy: ctx.userId },
      });
      finalPRStatus = "draft";
    }
  });

  // Lost the claim — someone else settled this PR first. Nothing was written, so
  // return before the Material Issue block below, which is the one side effect
  // that lives outside the transaction and would otherwise duplicate.
  if (conflict) {
    const winner = conflict.byUserId
      ? await findCnUserById(conflict.byUserId)
      : null;
    return NextResponse.json(
      { error: conflictMessage(conflict, winner?.fullName ?? null, "PR") },
      { status: 409 },
    );
  }

  // Preserve the existing auto-create Material Issue side effect on final
  // approval when stock is all available. MI lives in Postgres
  // (`cn_material_issues`) — write directly via Prisma so the MR queue
  // and the stock register both see the new issue.
  if (
    effectiveAction === "approve" &&
    finalPRStatus === "approved_stock_available" &&
    summary === "ALL_AVAILABLE"
  ) {
    let locationName = "";
    if (sourceLocationId) {
      try {
        const loc = await db.cnLocation.findFirst({
          where: { id: sourceLocationId, orgId: ctx.orgId },
          select: { name: true },
        });
        locationName = loc?.name ?? "";
      } catch {
        /* best-effort */
      }
    }

    const issueDateStr = new Date().toISOString().split("T")[0];
    const compactDate = issueDateStr.replace(/-/g, "");
    // Count today's existing issues across the tenant so issueNumber
    // stays unique. The pattern is MI-<YYYYMMDD>-<seq>.
    const todaysCount = await db.cnMaterialIssue.count({
      where: {
        orgId: ctx.orgId,
        issueDate: {
          gte: new Date(`${issueDateStr}T00:00:00.000Z`),
          lt: new Date(`${issueDateStr}T23:59:59.999Z`),
        },
      },
    });
    const issueNumber = `MI-${compactDate}-${String(todaysCount + 1).padStart(4, "0")}`;

    const lines = (pr.lines ?? []).map((l: {
      itemId?: string | null;
      itemName?: string | null;
      itemCode?: string | null;
      uomId?: string | null;
      uomCode?: string | null;
      quantity?: number | string | null;
      qtyRequired?: number | string | null;
      qtyRequested?: number | string | null;
      specification?: string | null;
      priority?: string | null;
      lineId?: string | null;
      id?: string | null;
    }) => ({
      itemId: l.itemId,
      itemName: l.itemName,
      itemCode: l.itemCode ?? "",
      uomId: l.uomId ?? "",
      uomCode: l.uomCode ?? "",
      quantity: l.quantity ?? l.qtyRequired ?? l.qtyRequested ?? "0",
      requestedQty: l.quantity ?? l.qtyRequired ?? l.qtyRequested ?? "0",
      specification: l.specification ?? "",
      priority: l.priority ?? "MEDIUM",
      sourceLineId: l.lineId ?? l.id ?? null,
      remarks: "",
    }));

    try {
      await db.cnMaterialIssue.create({
        data: tenantCreate(ctx, {
          issueNumber,
          projectId: pr.projectId,
          projectName: pr.projectName ?? "",
          locationId: sourceLocationId || null,
          locationName,
          issuedToName: "",
          purpose: pr.purpose
            ? `${pr.purpose} (from PR ${pr.prNumber ?? pr.id})`
            : `Requested from PR ${pr.prNumber ?? pr.id}`,
          issueDate: new Date(issueDateStr),
          materials: lines,
          lineCount: lines.length,
          status: "requested",
          prId: pr.id,
          prNumber: pr.prNumber ?? null,
          approvedBy: ctx.userName,
        }),
      });
    } catch (e: unknown) {
      console.error("[pr.approve] failed to create auto Material Issue:", toErrorMessage(e));
    }
  }

  const refreshed = await findPRById(ctx.orgId, pr.id);
  const refreshedInstance = await db.cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  if (!refreshedInstance) {
    return NextResponse.json({ error: "Approval instance not found" }, { status: 404 });
  }
  const totalSteps = await db.cnApprovalWorkflowStep.count({
    where: { workflowId: instance.workflowId },
  });
  return NextResponse.json({
    ok: true,
    action,
    pr: refreshed,
    approval: {
      id: refreshedInstance.id,
      status: refreshedInstance.status,
      currentStepOrder: refreshedInstance.currentStepOrder,
      totalSteps,
    },
  });
}
