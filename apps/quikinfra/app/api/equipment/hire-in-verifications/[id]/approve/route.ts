import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { findCnUserById } from "@/lib/users/lookup";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import {
  findHireInVerificationRow,
  patchHireInVerificationWorkflowStatus,
} from "@/lib/equipment/hire-rent-service";

type Action = "approve" | "reject" | "return";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_hire_rent",
    "approve",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "equip.hire_rent", "edit")) {
    return envelopeErr("FORBIDDEN", 'Action "edit" not allowed for equip.hire_rent', 403);
  }

  let body: { action?: string; comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
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

  const { id } = await params;
  const verification = await findHireInVerificationRow(ctx.orgId, id);
  if (!verification) {
    return NextResponse.json({ error: "Verification not found" }, { status: 404 });
  }
  if (!verification.approvalId) {
    return NextResponse.json(
      {
        error:
          "This verification was not submitted through a workflow — no approval instance exists.",
      },
      { status: 400 },
    );
  }

  const instance = await db.cnApprovalInstance.findFirst({
    where: { id: verification.approvalId, orgId: ctx.orgId },
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

  const currentStep = await db.cnApprovalWorkflowStep.findFirst({
    where: {
      workflowId: instance.workflowId,
      stepOrder: instance.currentStepOrder,
    },
  });
  if (!currentStep) {
    return NextResponse.json(
      {
        error: `Workflow step ${instance.currentStepOrder} is missing — the workflow may have been edited while this verification was mid-flight.`,
      },
      { status: 500 },
    );
  }

  if (
    !canActOnStep(
      { userId: ctx.userId, roleKey: ctx.roleKey, projectIds: ctx.projectIds },
      {
        approverUserId: currentStep.approverUserId,
        approverUserIds: currentStep.approverUserIds,
        approverRoleId: currentStep.approverRoleId,
      },
      verification.projectId ?? null,
    )
  ) {
    let expected = "an authorized approver";
    if (currentStep.approverUserId) {
      const pinned = await findCnUserById(currentStep.approverUserId);
      expected = pinned?.fullName
        ? `${pinned.fullName} (pinned approver)`
        : "the pinned approver for this step";
    } else if (currentStep.approverRoleId) {
      expected =
        `a user with role "${currentStep.approverRoleId}"` +
        (verification.projectId ? " assigned to this project" : "");
    }
    return NextResponse.json(
      {
        error: `You are not authorized to ${action} this verification at step ${instance.currentStepOrder}. Expected: ${expected}.`,
      },
      { status: 403 },
    );
  }

  const nextStep = await db.cnApprovalWorkflowStep.findFirst({
    where: {
      workflowId: instance.workflowId,
      stepOrder: { gt: instance.currentStepOrder },
    },
    orderBy: { stepOrder: "asc" },
  });

  let statusPatch: Parameters<typeof patchHireInVerificationWorkflowStatus>[2] | null = null;

  await db.$transaction(async (tx) => {
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
        statusPatch = {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
          updatedBy: ctx.userId,
        };
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
      statusPatch = {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: ctx.userId,
        rejectReason: comments,
        updatedBy: ctx.userId,
      };
    } else {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: { status: "returned", completedAt: new Date() },
      });
      statusPatch = {
        status: "computed",
        approvalId: null,
        returnedAt: new Date(),
        returnedBy: ctx.userId,
        returnReason: comments,
        updatedBy: ctx.userId,
      };
    }
  });

  const refreshed = statusPatch
    ? await patchHireInVerificationWorkflowStatus(ctx.orgId, verification.id, statusPatch)
    : await findHireInVerificationRow(ctx.orgId, verification.id).then((row) =>
        row ? { id: row.id, status: row.status } : null,
      );

  const refreshedInstance = await db.cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  const totalSteps = await db.cnApprovalWorkflowStep.count({
    where: { workflowId: instance.workflowId },
  });

  return NextResponse.json({
    ok: true,
    action,
    verification: refreshed,
    approval: refreshedInstance
      ? {
          id: refreshedInstance.id,
          status: refreshedInstance.status,
          currentStepOrder: refreshedInstance.currentStepOrder,
          totalSteps,
        }
      : null,
  });
}
