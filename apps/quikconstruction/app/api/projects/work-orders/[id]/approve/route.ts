import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/context";
import { actOnApproval } from "@/lib/approvals/act-on-approval";

/**
 * POST /api/projects/work-orders/:id/approve
 *
 * Workflow-driven approval for Work Orders. Workflow walk + step actor
 * check + history-row + instance update are delegated to
 * `actOnApproval`; this handler owns only the post-tx WO status patch.
 *
 *   Pending Approval ──approve (intermediate)──> Pending Approval (next step)
 *   Pending Approval ──approve (last step)─────> Approved
 *   Pending Approval ──reject─────────────────> Rejected
 *   Pending Approval ──return─────────────────> Draft  (approvalId cleared)
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 */
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
  const action = (body.action ?? "approve") as "approve" | "reject" | "return";
  const comments = String(body.comments ?? "").trim();

  const wo = await (db as any).cnWorkOrder.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
  });
  if (!wo) {
    return NextResponse.json(
      { error: "Work order not found" },
      { status: 404 },
    );
  }

  // WO has no approvedAt/By or rejectedAt/By columns — only status +
  // updatedBy. Keep the patch shape minimal so we don't fail with an
  // unknown-argument Prisma error.
  let woStatusUpdate: Record<string, unknown> | null = null;

  const outcome = await actOnApproval({
    ctx,
    entity: {
      id: wo.id,
      approvalId: wo.approvalId ?? null,
      projectId: wo.projectId ?? null,
    },
    entityLabel: "work order",
    action,
    comments,
    applyEntityPatch: async (_tx, args) => {
      if (args.phase === "intermediate-approve") return;
      if (args.phase === "final-approve") {
        woStatusUpdate = { status: "approved", updatedBy: ctx.userId };
      } else if (args.phase === "reject") {
        woStatusUpdate = { status: "rejected", updatedBy: ctx.userId };
      } else {
        woStatusUpdate = {
          status: "draft",
          approvalId: null,
          updatedBy: ctx.userId,
        };
      }
    },
  });

  if (outcome.kind === "error") {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  if (woStatusUpdate) {
    await (db as any).cnWorkOrder.update({
      where: { id: wo.id },
      data: woStatusUpdate,
    });
  }

  const refreshed = await (db as any).cnWorkOrder.findFirst({
    where: { id: wo.id, tenantId: ctx.tenantId },
  });
  return NextResponse.json({
    ok: true,
    action,
    workOrder: refreshed,
    approval: {
      id: outcome.instanceId,
      status: outcome.newInstanceStatus,
      currentStepOrder: outcome.newCurrentStepOrder,
      totalSteps: outcome.totalSteps,
    },
  });
}
