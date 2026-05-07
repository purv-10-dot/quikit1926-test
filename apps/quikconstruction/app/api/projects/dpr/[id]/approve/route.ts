import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/context";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import { boqService, BOQError } from "@/lib/boq";
import { recordAudit } from "@/lib/workflow/audit";

/**
 * POST /api/projects/dpr/:id/approve
 *
 * Workflow-driven approval for DPRs. Mirrors the Work Order approve route
 * step-walk semantics, plus BOQ-posting on the final approve step.
 *
 *   pending_approval ──approve (intermediate)──> pending_approval (next step)
 *   pending_approval ──approve (last step)─────> approved   + BOQ progress posted
 *   pending_approval ──reject─────────────────> rejected
 *   pending_approval ──return─────────────────> draft (approvalId cleared)
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

  const dpr = await (db as any).cnDailyProgressReport.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    select: {
      id: true,
      status: true,
      approvalId: true,
      projectId: true,
      workItems: {
        select: {
          id: true,
          boqItemId: true,
          todayQty: true,
          woId: true,
        },
      },
    },
  });
  if (!dpr || dpr.status === "inactive") {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }
  if (!dpr.approvalId) {
    return NextResponse.json(
      {
        error:
          "This DPR was not submitted through a workflow — no approval instance exists.",
      },
      { status: 400 },
    );
  }

  const instance = await (db as any).cnApprovalInstance.findFirst({
    where: { id: dpr.approvalId, tenantId: ctx.tenantId },
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
        error: `Workflow step ${instance.currentStepOrder} is missing — the workflow may have been edited while this DPR was mid-flight.`,
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
      dpr.projectId ?? null,
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
        (dpr.projectId ? ` assigned to this project` : "");
    }
    return NextResponse.json(
      {
        error: `You are not authorized to ${action} this DPR at step ${instance.currentStepOrder}. Expected: ${expected}.`,
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

  // ── Pre-resolve BOQ ids → boqNos so the txn doesn't do extra reads. ──
  // Only used when action === "approve" AND this is the final step.
  const isFinalApprove = action === "approve" && !nextStep;
  let boqNoById = new Map<string, string>();
  if (isFinalApprove) {
    const boqItemIds = (dpr.workItems ?? [])
      .map((l: any) => l.boqItemId)
      .filter(Boolean);
    if (boqItemIds.length) {
      const boqRows = await (db as any).cnBOQItemV2.findMany({
        where: {
          id: { in: boqItemIds },
          tenantId: ctx.tenantId,
          projectId: dpr.projectId,
        },
        select: { id: true, boqNo: true },
      });
      boqNoById = new Map<string, string>(
        boqRows.map((r: any) => [r.id, r.boqNo]),
      );
    }
  }

  let dprStatusUpdate: Record<string, unknown> | null = null;
  const appliedUpdates: Array<{ boqNo: string; qty: number; workType: string }> = [];

  try {
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
          // Final step → flip DPR to approved AND post BOQ progress
          // entries inside this same transaction.
          await tx.cnApprovalInstance.update({
            where: { id: instance.id },
            data: { status: "approved", completedAt: new Date() },
          });

          for (const line of dpr.workItems ?? []) {
            const boqNo = boqNoById.get(line.boqItemId);
            const todayQty = parseFloat(String(line.todayQty ?? "0"));
            if (!boqNo || todayQty <= 0) continue;

            const workType: "sub_contractor" | "self" = line.woId
              ? "sub_contractor"
              : "self";

            await boqService.applyDPRProgressTxn(
              tx,
              ctx,
              dpr.projectId,
              boqNo,
              todayQty,
              workType,
              {
                dprId: dpr.id,
                dprLineId: line.id,
                overrideFlag: false,
              },
            );

            appliedUpdates.push({ boqNo, qty: todayQty, workType });
          }

          await recordAudit(tx, ctx, {
            entityType: "dpr",
            entityId: dpr.id,
            action: "approve",
            changes: {
              from: dpr.status,
              to: "approved",
              linesApplied: appliedUpdates.length,
              comments: comments || undefined,
            },
          });

          dprStatusUpdate = { status: "approved", updatedBy: ctx.userId };
        } else {
          await tx.cnApprovalInstance.update({
            where: { id: instance.id },
            data: { currentStepOrder: nextStep.stepOrder },
          });
          // Mid-flow — DPR stays "submitted" / "pending_approval".
        }
      } else if (action === "reject") {
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: { status: "rejected", completedAt: new Date() },
        });
        await recordAudit(tx, ctx, {
          entityType: "dpr",
          entityId: dpr.id,
          action: "reject",
          changes: { from: dpr.status, to: "rejected", comments },
        });
        dprStatusUpdate = { status: "rejected", updatedBy: ctx.userId };
      } else {
        // "return" — back to draft for the raiser to edit; clearing
        // approvalId means the next submit creates a fresh instance.
        await tx.cnApprovalInstance.update({
          where: { id: instance.id },
          data: { status: "returned", completedAt: new Date() },
        });
        await recordAudit(tx, ctx, {
          entityType: "dpr",
          entityId: dpr.id,
          action: "return",
          changes: { from: dpr.status, to: "draft", comments },
        });
        dprStatusUpdate = {
          status: "draft",
          approvalId: null,
          updatedBy: ctx.userId,
        };
      }
    });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: err.httpStatus },
      );
    }
    throw err;
  }

  if (dprStatusUpdate) {
    await (db as any).cnDailyProgressReport.update({
      where: { id: dpr.id },
      data: dprStatusUpdate,
    });
  }

  const refreshed = await (db as any).cnDailyProgressReport.findFirst({
    where: { id: dpr.id, tenantId: ctx.tenantId },
  });
  const refreshedInstance = await (db as any).cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  const totalSteps = await (db as any).cnApprovalWorkflowStep.count({
    where: { workflowId: instance.workflowId },
  });

  return NextResponse.json({
    ok: true,
    action,
    dpr: refreshed,
    approval: {
      id: refreshedInstance.id,
      status: refreshedInstance.status,
      currentStepOrder: refreshedInstance.currentStepOrder,
      totalSteps,
    },
    boqUpdatesApplied: appliedUpdates.length,
    updates: appliedUpdates,
  });
}
