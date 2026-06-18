import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findGatePassById,
  patchGatePassStatus,
} from "@/lib/store/gate-pass-repository";
import { actOnApproval } from "@/lib/approvals/act-on-approval";

/**
 * POST /api/store/gate-passes/:id/approve
 *
 * Workflow-driven approval for Gate Passes. Workflow walk + step
 * actor check + history-row + instance update are delegated to
 * `actOnApproval`; this handler owns only the post-tx gate-pass
 * status patch (the gate-pass repository uses raw SQL and can't join
 * the approval-instance transaction).
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
  const ctxOrResp = await requireStoreAction("construction.gatepass", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "store.gate_pass", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.gate_pass`, 403);
  }

  let body: { action?: string; comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const action = (body.action ?? "approve") as "approve" | "reject" | "return";
  const comments = String(body.comments ?? "").trim();

  const gatePass = await findGatePassById(ctx.orgId, params.id);
  if (!gatePass) {
    return NextResponse.json(
      { error: "Gate Pass not found" },
      { status: 404 },
    );
  }

  let gpStatusUpdate: Record<string, unknown> | null = null;

  const outcome = await actOnApproval({
    ctx,
    entity: {
      id: gatePass.id,
      approvalId: gatePass.approvalId ?? null,
      projectId: gatePass.projectId ?? null,
    },
    entityLabel: "gate pass",
    action,
    comments,
    applyEntityPatch: async (_tx, args) => {
      if (args.phase === "intermediate-approve") return;
      if (args.phase === "final-approve") {
        gpStatusUpdate = {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
        };
      } else if (args.phase === "reject") {
        gpStatusUpdate = {
          status: "rejected",
          rejectedAt: new Date(),
          rejectedBy: ctx.userId,
          rejectionReason: args.comments,
        };
      } else {
        gpStatusUpdate = {
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

  if (gpStatusUpdate) {
    await patchGatePassStatus(ctx.orgId, gatePass.id, {
      ...(gpStatusUpdate as Parameters<typeof patchGatePassStatus>[2]),
      updatedBy: ctx.userId,
    });
  }

  const refreshed = await findGatePassById(ctx.orgId, gatePass.id);
  return NextResponse.json({
    ok: true,
    action,
    gatePass: refreshed,
    approval: {
      id: outcome.instanceId,
      status: outcome.newInstanceStatus,
      currentStepOrder: outcome.newCurrentStepOrder,
      totalSteps: outcome.totalSteps,
    },
  });
}
