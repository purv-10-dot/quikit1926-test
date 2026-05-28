import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import {
  requireAnyPermission,
  hasMatrixAction,
} from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { findPOById } from "@/lib/purchase/po-repository";
import { sendPoEmailToVendor } from "@/lib/purchase/po-email";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

/**
 * POST /api/purchase/orders/:id/approve — multi-step PO approval.
 *
 * Mirrors the PR / RFQ approve routes. The PO carries `approvalId`
 * pointing at its `CnApprovalInstance`. On each action we:
 *
 *   1. Validate the current user is the expected actor for the
 *      instance's current step.
 *   2. Record a history row.
 *   3. On "approve": advance to next step, or — if this was the final
 *      step — close the instance, flip status to "approved", and email
 *      the PO PDF to the vendor. The vendor email ONLY goes out at the
 *      final step so intermediate approvers can still reject/return
 *      without the vendor having seen the PO.
 *   4. On "reject" / "return": mark instance + PO accordingly. No
 *      vendor email ever goes out from a rejected flow.
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 */

type Action = "approve" | "reject" | "return";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAnyPermission([
    "purchase.po.approve_l1",
    "purchase.po.approve_l2",
  ]);
  if (auth instanceof NextResponse) return auth;
  const ctx = auth;

  if (!hasMatrixAction(ctx, "purchase.po", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.po`, 403);
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

  const po = await findPOById(ctx.orgId, params.id);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  if (!po.approvalId) {
    return NextResponse.json(
      { error: "This PO was not submitted through a workflow — no approval instance exists." },
      { status: 400 },
    );
  }

  const instance = await (db as any).cnApprovalInstance.findFirst({
    where: { id: po.approvalId, orgId: ctx.orgId },
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
        error: `Workflow step ${instance.currentStepOrder} is missing — the workflow may have been edited while this PO was mid-flight.`,
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
      po.projectId ?? null,
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
        (po.projectId ? ` assigned to this project` : "");
    }
    return NextResponse.json(
      {
        error: `You are not authorized to ${action} this PO at step ${instance.currentStepOrder}. Expected: ${expected}.`,
      },
      { status: 403 },
    );
  }

  const nextStep = await (db as any).cnApprovalWorkflowStep.findFirst({
    where: {
      workflowId: instance.workflowId,
      stepOrder: { gt: instance.currentStepOrder },
    },
    orderBy: { stepOrder: "asc" },
  });

  let finalPOStatus: string | null = null;
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
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: { status: "approved", completedAt: new Date() },
        });
        await tx.cnPurchaseOrder.update({
          where: { id: po.id },
          data: { status: "approved", updatedBy: ctx.userId },
        });
        finalPOStatus = "approved";
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
      await tx.cnPurchaseOrder.update({
        where: { id: po.id },
        data: { status: "rejected", updatedBy: ctx.userId },
      });
      finalPOStatus = "rejected";
    } else {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: { status: "returned", completedAt: new Date() },
      });
      await tx.cnPurchaseOrder.update({
        where: { id: po.id },
        data: { status: "draft", approvalId: null, updatedBy: ctx.userId },
      });
      finalPOStatus = "draft";
    }
  });

  // Vendor email goes out ONLY at the final approve — never on
  // intermediate steps, reject, or return.
  let mailResult: Awaited<ReturnType<typeof sendPoEmailToVendor>> | null = null;
  if (isFinalApprove) {
    const updated = await findPOById(ctx.orgId, po.id);
    try {
      mailResult = await sendPoEmailToVendor(ctx.orgId, updated, {
        emailHtmlBody: null,
      });
      console.log(
        `[po:approve] mail to vendor for ${updated.poNumber}: ` +
          `sent=${mailResult.sent} email=${mailResult.email ?? "(none)"}${
            mailResult.skippedReason ? ` skipped="${mailResult.skippedReason}"` : ""
          }${mailResult.error ? ` error="${mailResult.error}"` : ""}`,
      );
    } catch (e: any) {
      console.warn(
        `[po:approve] mailer threw for ${updated.poNumber}:`,
        e?.message ?? e,
      );
    }

    if (mailResult?.sent) {
      await (db as any).cnPurchaseOrder.update({
        where: { id: po.id },
        data: { status: "sent", updatedBy: ctx.userId },
      });
      finalPOStatus = "sent";
    }
  }

  const refreshed = await findPOById(ctx.orgId, po.id);
  const refreshedInstance = await (db as any).cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  const totalSteps = await (db as any).cnApprovalWorkflowStep.count({
    where: { workflowId: instance.workflowId },
  });
  return NextResponse.json({
    ok: true,
    action,
    po: refreshed,
    finalStatus: finalPOStatus,
    approval: {
      id: refreshedInstance.id,
      status: refreshedInstance.status,
      currentStepOrder: refreshedInstance.currentStepOrder,
      totalSteps,
    },
    mail: mailResult,
  });
}
