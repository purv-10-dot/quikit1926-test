import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireAuth, tenantCreate } from "@/lib/auth/context";
import { findPRById } from "@/lib/purchase/pr-repository";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

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

type Action = "approve" | "reject" | "return";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const action = (body.action ?? "approve") as Action;
  const comments = String(body.comments ?? "").trim();
  const sourceLocationId: string = body?.sourceLocationId ?? "";

  if (!["approve", "reject", "return"].includes(action)) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
  if ((action === "reject" || action === "return") && !comments) {
    return NextResponse.json(
      { error: `Comments are required for ${action} actions` },
      { status: 400 },
    );
  }

  const pr = await findPRById(ctx.tenantId, params.id);
  if (!pr) return NextResponse.json({ error: "PR not found" }, { status: 404 });
  if (!pr.approvalId) {
    return NextResponse.json(
      { error: "This PR was not submitted through a workflow — no approval instance exists." },
      { status: 400 },
    );
  }

  const instance = await (db as any).cnApprovalInstance.findFirst({
    where: { id: pr.approvalId, tenantId: ctx.tenantId },
  });
  if (!instance) {
    return NextResponse.json({ error: "Approval instance not found" }, { status: 404 });
  }
  if (instance.status !== "pending_approval") {
    return NextResponse.json(
      { error: `Approval already ${instance.status} — no further actions allowed.` },
      { status: 409 },
    );
  }

  const currentStep = await (db as any).cnApprovalWorkflowStep.findFirst({
    where: {
      workflowId: instance.workflowId,
      stepOrder: instance.currentStepOrder,
    },
  });
  if (!currentStep) {
    return NextResponse.json(
      {
        error: `Workflow step ${instance.currentStepOrder} is missing — the workflow may have been edited while this PR was mid-flight.`,
      },
      { status: 500 },
    );
  }

  if (
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
      const pinned = await (db as any).cnUser.findUnique({
        where: { id: currentStep.approverUserId },
        select: { fullName: true },
      });
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
        error: `You are not authorized to ${action} this PR at step ${instance.currentStepOrder}. Expected: ${expected}.`,
      },
      { status: 403 },
    );
  }

  // Find the next step by ascending stepOrder so approvals follow the
  // admin's actual numbering, even if it's non-contiguous (e.g. [1,3,5]).
  const nextStep = await (db as any).cnApprovalWorkflowStep.findFirst({
    where: {
      workflowId: instance.workflowId,
      stepOrder: { gt: instance.currentStepOrder },
    },
    orderBy: { stepOrder: "asc" },
  });

  const summary = String(pr.stockCheckSummary ?? "").toUpperCase();
  const finalPRStatusOnApprove =
    summary === "ALL_AVAILABLE" ? "approved_stock_available" : "approved_indent_required";

  let finalPRStatus: string | null = null;

  await db.$transaction(async (tx: any) => {
    await tx.cnApprovalHistory.create({
      data: {
        instanceId: instance.id,
        stepOrder: instance.currentStepOrder,
        action,
        actionById: ctx.userId,
        comments: comments || null,
      },
    });

    if (action === "approve") {
      if (!nextStep) {
        // No step after this one — close the instance and flip the PR.
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: { status: "approved", completedAt: new Date() },
        });
        await tx.cnPurchaseRequisition.update({
          where: { id: pr.id },
          data: { status: finalPRStatusOnApprove, updatedBy: ctx.userId },
        });
        finalPRStatus = finalPRStatusOnApprove;
      } else {
        // Intermediate step — advance to the next configured step's order.
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: { currentStepOrder: nextStep.stepOrder },
        });
      }
    } else if (action === "reject") {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: { status: "rejected", completedAt: new Date() },
      });
      await tx.cnPurchaseRequisition.update({
        where: { id: pr.id },
        data: { status: "rejected", updatedBy: ctx.userId },
      });
      finalPRStatus = "rejected";
    } else {
      // "return" — sends the PR back to draft for the requester to edit.
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: { status: "returned", completedAt: new Date() },
      });
      await tx.cnPurchaseRequisition.update({
        where: { id: pr.id },
        data: { status: "draft", approvalId: null, updatedBy: ctx.userId },
      });
      finalPRStatus = "draft";
    }
  });

  // Preserve the existing auto-create Material Issue side effect on final
  // approval when stock is all available. MI lives in Postgres
  // (`material_issues`) — write directly via Prisma so the MR queue
  // and the stock register both see the new issue.
  if (
    action === "approve" &&
    finalPRStatus === "approved_stock_available" &&
    summary === "ALL_AVAILABLE"
  ) {
    let locationName = "";
    if (sourceLocationId) {
      try {
        const loc = await (db as any).cnLocation.findFirst({
          where: { id: sourceLocationId, tenantId: ctx.tenantId },
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
    const todaysCount = await (db as any).cnMaterialIssue.count({
      where: {
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        issueDate: {
          gte: new Date(`${issueDateStr}T00:00:00.000Z`),
          lt: new Date(`${issueDateStr}T23:59:59.999Z`),
        },
      },
    });
    const issueNumber = `MI-${compactDate}-${String(todaysCount + 1).padStart(4, "0")}`;

    const lines = (pr.lines ?? []).map((l: any) => ({
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
      await (db as any).cnMaterialIssue.create({
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
      const ne = e as { code?: string; message?: string };
      console.error("[pr.approve] failed to create auto Material Issue:", ne?.message ?? e);
    }
  }

  const refreshed = await findPRById(ctx.tenantId, pr.id);
  const refreshedInstance = await (db as any).cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  const totalSteps = await (db as any).cnApprovalWorkflowStep.count({
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
