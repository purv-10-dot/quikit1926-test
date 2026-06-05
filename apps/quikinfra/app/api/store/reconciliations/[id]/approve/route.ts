import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { actOnApproval } from "@/lib/approvals/act-on-approval";

/**
 * POST /api/store/reconciliations/:id/approve
 *
 * Workflow-driven approval for Stock Reconciliation. Mirrors the
 * Estimation / Material Issue / Stock Transfer routes — `actOnApproval`
 * owns the workflow walk + step actor check + history-row + instance
 * update inside one transaction; this handler only owns the post-tx
 * recon status patch.
 *
 *   Pending Approval ──approve (intermediate)──> Pending Approval (next step)
 *   Pending Approval ──approve (last step)─────> Approved
 *   Pending Approval ──reject─────────────────> Rejected
 *   Pending Approval ──return─────────────────> Draft (approvalId cleared)
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 *
 * Schema note: CnStockReconciliation has only `status`, `approvalId`,
 * and `approvedById` for workflow bookkeeping (no approvedAt /
 * rejectedAt / returnedAt / rejectionReason columns). Reject and return
 * comments still go on the approval history row via `actOnApproval` —
 * the recon row just tracks status.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.reconciliation", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "store.recon", "edit")) {
    return envelopeErr(
      "FORBIDDEN",
      `Action "edit" not allowed for store.recon`,
      403,
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const action = (body.action ?? "approve") as "approve" | "reject" | "return";
  const comments = String(body.comments ?? "").trim();

  const recon = await (db as any).cnStockReconciliation.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
  });
  if (!recon) {
    return NextResponse.json(
      { error: "Reconciliation not found" },
      { status: 404 },
    );
  }

  let reconStatusPatch: Record<string, unknown> | null = null;

  const outcome = await actOnApproval({
    ctx,
    entity: {
      id: recon.id,
      approvalId: recon.approvalId ?? null,
      projectId: recon.projectId ?? null,
    },
    entityLabel: "reconciliation",
    action,
    comments,
    applyEntityPatch: async (_tx, args) => {
      if (args.phase === "intermediate-approve") return;
      if (args.phase === "final-approve") {
        reconStatusPatch = {
          status: "approved",
          approvedById: ctx.userId,
        };
      } else if (args.phase === "reject") {
        reconStatusPatch = {
          status: "rejected",
        };
      } else {
        // return → back to draft, drop the approvalId so a fresh
        // submission creates a new instance.
        reconStatusPatch = {
          status: "draft",
          approvalId: null,
        };
      }
    },
  });

  if (outcome.kind === "error") {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  const finalPatch = reconStatusPatch as Record<string, unknown> | null;
  if (finalPatch) {
    await (db as any).cnStockReconciliation.update({
      where: { id: recon.id },
      data: {
        ...finalPatch,
        updatedBy: ctx.userId,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    action,
    approval: {
      id: outcome.instanceId,
      status: outcome.newInstanceStatus,
      currentStepOrder: outcome.newCurrentStepOrder,
      totalSteps: outcome.totalSteps,
    },
  });
}
