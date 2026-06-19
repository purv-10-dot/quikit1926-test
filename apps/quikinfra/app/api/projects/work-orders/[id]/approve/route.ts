import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
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
  const ctxOrResp = await requireProjectsFinanceAction("construction.wo", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "pm.work_order", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for pm.work_order`, 403);
  }

  let body: { action?: string; comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const action = (body.action ?? "approve") as "approve" | "reject" | "return";
  const comments = String(body.comments ?? "").trim();

  const wo = await db.cnWorkOrder.findFirst({
    where: { id: params.id, orgId: ctx.orgId},
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
    await db.cnWorkOrder.update({
      where: { id: wo.id },
      data: woStatusUpdate,
    });
  }

  const refreshed = await db.cnWorkOrder.findFirst({
    where: { id: wo.id, orgId: ctx.orgId},
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
