import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/context";
import {
  findGoodReturnById,
  patchGoodReturnStatus,
} from "@/lib/store/good-return-repository";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

/**
 * POST /api/store/good-returns/:id/approve
 *
 * Workflow-driven approval for Good Returns. Mirrors the Material
 * Issue / Gate Pass approve route. The GR row is updated via the
 * good-return repository after the Prisma transaction commits —
 * same split we use for MI/GP since the status patch is raw SQL and
 * can't join the approval-instance transaction.
 *
 *   Pending Approval ──approve (intermediate)──> Pending Approval (next step)
 *   Pending Approval ──approve (last step)─────> Approved
 *   Pending Approval ──reject─────────────────> Rejected
 *   Pending Approval ──return─────────────────> Draft  (approvalId cleared)
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

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const action = (body.action ?? "approve") as Action;
  const comments = String(body.comments ?? "").trim();

  if (!["approve", "reject", "return"].includes(action)) {
    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  }
  if ((action === "reject" || action === "return") && !comments) {
    return NextResponse.json(
      { error: `Comments are required for ${action} actions` },
      { status: 400 },
    );
  }

  const gr = await findGoodReturnById(ctx.tenantId, params.id);
  if (!gr) {
    return NextResponse.json(
      { error: "Good Return not found" },
      { status: 404 },
    );
  }
  if (!gr.approvalId) {
    return NextResponse.json(
      {
        error:
          "This good return was not submitted through a workflow — no approval instance exists.",
      },
      { status: 400 },
    );
  }

  const instance = await (db as any).cnApprovalInstance.findFirst({
    where: { id: gr.approvalId, tenantId: ctx.tenantId },
  });
  if (!instance) {
    return NextResponse.json(
      { error: "Approval instance not found" },
      { status: 404 },
    );
  }
  if (instance.status !== "pending_approval") {
    return NextResponse.json(
      {
        error: `Approval already ${instance.status} — no further actions allowed.`,
      },
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
        error: `Workflow step ${instance.currentStepOrder} is missing — the workflow may have been edited while this return was mid-flight.`,
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
      gr.projectId ?? null,
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
        (gr.projectId ? ` assigned to this project` : "");
    }
    return NextResponse.json(
      {
        error: `You are not authorized to ${action} this good return at step ${instance.currentStepOrder}. Expected: ${expected}.`,
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

  let grStatusUpdate: Record<string, unknown> | null = null;

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
        grStatusUpdate = {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
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
      grStatusUpdate = {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: ctx.userId,
        rejectionReason: comments,
      };
    } else {
      await tx.cnApprovalInstance.update({
        where: { id: instance.id },
        data: { status: "returned", completedAt: new Date() },
      });
      grStatusUpdate = {
        status: "draft",
        approvalId: null,
        returnedAt: new Date(),
        returnedBy: ctx.userId,
        returnReason: comments,
      };
    }
  });

  if (grStatusUpdate) {
    await patchGoodReturnStatus(ctx.tenantId, gr.id, {
      ...(grStatusUpdate as any),
      updatedBy: ctx.userId,
    });
  }

  const refreshed = await findGoodReturnById(ctx.tenantId, gr.id);
  const refreshedInstance = await (db as any).cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  const totalSteps = await (db as any).cnApprovalWorkflowStep.count({
    where: { workflowId: instance.workflowId },
  });
  return NextResponse.json({
    ok: true,
    action,
    goodReturn: refreshed,
    approval: {
      id: refreshedInstance.id,
      status: refreshedInstance.status,
      currentStepOrder: refreshedInstance.currentStepOrder,
      totalSteps,
    },
  });
}
