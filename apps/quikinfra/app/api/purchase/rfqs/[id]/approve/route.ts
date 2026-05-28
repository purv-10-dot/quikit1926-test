import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireAuth, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { findRfqById } from "@/lib/purchase/rfq-repository";
import { sendRfqEmailsToVendors } from "@/lib/purchase/rfq-email";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

/**
 * POST /api/purchase/rfqs/:id/approve — multi-step RFQ approval.
 *
 * Mirrors the PR approve route. The RFQ carries `approvalId` pointing
 * at its `CnApprovalInstance`. On each action we:
 *
 *   1. Validate the current user is the expected actor for the
 *      instance's current step.
 *   2. Record a history row.
 *   3. On "approve": advance to next step, or — if this was the final
 *      step — close the instance, flip status to "approved", and fan
 *      out the RFQ PDF to every attached vendor. Vendor emails ONLY
 *      go out at the final step so intermediate approvers can still
 *      reject/return without vendors having seen the RFQ.
 *   4. On "reject" / "return": mark instance + RFQ accordingly. No
 *      vendor emails ever go out from a rejected flow.
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 */

type Action = "approve" | "reject" | "return";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  if (!hasMatrixAction(ctx, "purchase.rfq", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.rfq`, 403);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine for plain approve */
  }
  const action = (body.action ?? "approve") as Action;
  const comments = String(body.comments ?? "").trim();

  if (!["approve", "reject", "return"].includes(action)) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
  if ((action === "reject" || action === "return") && !comments) {
    return NextResponse.json(
      { error: `Comments are required for ${action} actions` },
      { status: 400 },
    );
  }

  const rfq = await findRfqById(ctx.orgId, params.id);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  if (!rfq.approvalId) {
    return NextResponse.json(
      { error: "This RFQ was not submitted through a workflow — no approval instance exists." },
      { status: 400 },
    );
  }

  const instance = await (db as any).cnApprovalInstance.findFirst({
    where: { id: rfq.approvalId, orgId: ctx.orgId },
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
        error: `Workflow step ${instance.currentStepOrder} is missing — the workflow may have been edited while this RFQ was mid-flight.`,
      },
      { status: 500 },
    );
  }

  if (
    !canActOnStep(
      { userId: ctx.userId, roleKey: ctx.roleKey, projectIds: ctx.projectIds },
      {
        approverUserId: currentStep.approverUserId,
        approverUserIds: Array.isArray((currentStep as any).approverUserIds)
          ? (currentStep as any).approverUserIds
          : null,
        approverRoleId: currentStep.approverRoleId,
      } as any,
      rfq.projectId ?? null,
    )
  ) {
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
        (rfq.projectId ? ` assigned to this project` : "");
    }
    return NextResponse.json(
      {
        error: `You are not authorized to ${action} this RFQ at step ${instance.currentStepOrder}. Expected: ${expected}.`,
      },
      { status: 403 },
    );
  }

  // Find the next step by ascending stepOrder so approvals follow the
  // admin's actual numbering, even if it's non-contiguous.
  const nextStep = await (db as any).cnApprovalWorkflowStep.findFirst({
    where: {
      workflowId: instance.workflowId,
      stepOrder: { gt: instance.currentStepOrder },
    },
    orderBy: { stepOrder: "asc" },
  });

  let finalRfqStatus: string | null = null;
  let isFinalApprove = false;

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
        // Final step — close instance and flip the RFQ.
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: { status: "approved", completedAt: new Date() },
        });
        await tx.cnRfq.update({
          where: { id: rfq.id },
          data: { status: "approved", updatedBy: ctx.userId },
        });
        finalRfqStatus = "approved";
        isFinalApprove = true;
      } else {
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
      await tx.cnRfq.update({
        where: { id: rfq.id },
        data: { status: "rejected", updatedBy: ctx.userId },
      });
      finalRfqStatus = "rejected";
    } else {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: { status: "returned", completedAt: new Date() },
      });
      await tx.cnRfq.update({
        where: { id: rfq.id },
        data: { status: "draft", approvalId: null, updatedBy: ctx.userId },
      });
      finalRfqStatus = "draft";
    }
  });

  // Fan out the RFQ PDF to vendors ONLY at final approve — never on
  // intermediate steps, reject, or return. This is the whole point of
  // the multi-level workflow: vendors should not see the RFQ until
  // every approver has signed off.
  let emailResult: Awaited<ReturnType<typeof sendRfqEmailsToVendors>> | null =
    null;
  if (isFinalApprove) {
    const updated = await findRfqById(ctx.orgId, rfq.id);
    try {
      // Default per-vendor template — the raiser's cover-text override
      // captured on submit isn't persisted today (no schema column),
      // so the final approver's fan-out always uses the default.
      emailResult = await sendRfqEmailsToVendors(ctx.orgId, updated, {
        emailHtmlBodies: null,
      });
      console.log(
        `[rfq:approve] mail fan-out for ${updated.rfqNumber}: ` +
          `sent=${emailResult.sent.length} ` +
          `skipped=${emailResult.skipped.length} ` +
          `failed=${emailResult.failed.length}`,
      );
    } catch (e: any) {
      console.warn(
        `[rfq:approve] mail fan-out threw for ${updated.rfqNumber}:`,
        e?.message ?? e,
      );
    }

    // Once at least one mail has left, advance approved → sent so the
    // status chip reflects reality. Also clear the staged cover bodies.
    if (emailResult && emailResult.sent.length > 0) {
      await (db as any).cnRfq.update({
        where: { id: rfq.id },
        data: { status: "sent", updatedBy: ctx.userId },
      });
      finalRfqStatus = "sent";
    }
  }

  const refreshed = await findRfqById(ctx.orgId, rfq.id);
  const refreshedInstance = await (db as any).cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  const totalSteps = await (db as any).cnApprovalWorkflowStep.count({
    where: { workflowId: instance.workflowId },
  });
  return NextResponse.json({
    ok: true,
    action,
    rfq: refreshed,
    finalStatus: finalRfqStatus,
    approval: {
      id: refreshedInstance.id,
      status: refreshedInstance.status,
      currentStepOrder: refreshedInstance.currentStepOrder,
      totalSteps,
    },
    mail: emailResult,
  });
}
