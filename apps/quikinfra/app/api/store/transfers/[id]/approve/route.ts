import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findStockTransferById,
  patchStockTransferStatus,
} from "@/lib/store/stock-transfer-repository";
import { actOnApproval } from "@/lib/approvals/act-on-approval";

/**
 * POST /api/store/transfers/:id/approve
 *
 * Workflow-driven approval for Stock Transfers. Workflow walk + step
 * actor check + history-row + instance update are delegated to
 * `actOnApproval`; this handler owns only the post-tx ST status patch
 * (the stock-transfer repository uses raw SQL and can't join the
 * approval-instance transaction, so the patch runs after commit).
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
  const ctxOrResp = await requireStoreAction("construction.transfer", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "store.transfer", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.transfer`, 403);
  }

  let body: { action?: string; comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const action = (body.action ?? "approve") as "approve" | "reject" | "return";
  const comments = String(body.comments ?? "").trim();

  const st = await findStockTransferById(ctx.orgId, params.id);
  if (!st) {
    return NextResponse.json(
      { error: "Stock Transfer not found" },
      { status: 404 },
    );
  }

  // Build the entity-status patch lazily — applied post-tx via the
  // repository helper, since stock-transfer's update path uses raw
  // SQL and can't enroll in the approval-instance transaction.
  type StTransferPatch = Parameters<typeof patchStockTransferStatus>[2];
  let stStatusUpdate: Omit<StTransferPatch, "updatedBy"> | null = null;

  const outcome = await actOnApproval({
    ctx,
    entity: {
      id: st.id,
      approvalId: st.approvalId ?? null,
      projectId: st.sourceProjectId ?? null,
    },
    entityLabel: "stock transfer",
    action,
    comments,
    applyEntityPatch: async (_tx, args) => {
      if (args.phase === "intermediate-approve") return;
      if (args.phase === "final-approve") {
        stStatusUpdate = {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
        };
      } else if (args.phase === "reject") {
        stStatusUpdate = {
          status: "rejected",
          rejectedAt: new Date(),
          rejectedBy: ctx.userId,
          rejectionReason: args.comments,
        };
      } else {
        stStatusUpdate = {
          status: "draft",
          approvalId: null,
          returnedAt: new Date(),
          returnedBy: ctx.userId,
          returnReason: args.comments,
        };
      }
    },
  });

  if (outcome.kind === "error") {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  if (stStatusUpdate) {
    await patchStockTransferStatus(ctx.orgId, st.id, {
      ...(stStatusUpdate as StTransferPatch),
      updatedBy: ctx.userId,
    });
  }

  const refreshed = await findStockTransferById(ctx.orgId, st.id);
  return NextResponse.json({
    ok: true,
    action,
    stockTransfer: refreshed,
    approval: {
      id: outcome.instanceId,
      status: outcome.newInstanceStatus,
      currentStepOrder: outcome.newCurrentStepOrder,
      totalSteps: outcome.totalSteps,
    },
  });
}
