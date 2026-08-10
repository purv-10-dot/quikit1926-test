import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { findCnUserById } from "@/lib/users/lookup";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findGoodReturnById,
  patchGoodReturnStatus,
} from "@/lib/store/good-return-repository";
import {
  claimAndRecord,
  gateApprovalAction,
  gateConflictResponse,
  GATE_ACTIONS,
  type GateAction,
} from "@/lib/approvals/approval-gate";
import type { ClaimResult } from "@/lib/approvals/claim-instance";

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

type Action = GateAction;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.return", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "store.good_return", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.good_return`, 403);
  }

  let body: { action?: string; comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }
  const action = (body.action ?? "approve") as Action;
  const comments = String(body.comments ?? "").trim();

  if (!GATE_ACTIONS.includes(action)) {
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

  const gr = await findGoodReturnById(ctx.orgId, params.id);
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

  const instance = await db.cnApprovalInstance.findFirst({
    where: { id: gr.approvalId, orgId: ctx.orgId },
  });
  if (!instance) {
    return NextResponse.json(
      { error: "Approval instance not found" },
      { status: 404 },
    );
  }

  // Authorisation, step resolution and the repair / master-approval branches
  // live in the shared gate; this route keeps only the return's own patch.
  const gate = await gateApprovalAction({
    ctx,
    instance,
    entityLabel: "good return",
    action,
    comments,
    projectId: gr.projectId ?? null,
  });
  if (gate.kind === "error") {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  let grStatusUpdate: Record<string, unknown> | null = null;
  let conflict: ClaimResult["conflict"] | undefined;

  await db.$transaction(async (tx) => {
    const claim = await claimAndRecord(tx, ctx, instance, gate);
    if (!claim.claimed) {
      conflict = claim.conflict;
      return;
    }

    if (gate.effectiveAction === "approve") {
      if (gate.isFinalApprove) {
        grStatusUpdate = {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
        };
      }
      // Intermediate — the return stays as it is.
    } else if (gate.effectiveAction === "reject") {
      grStatusUpdate = {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: ctx.userId,
        rejectionReason: comments,
      };
    } else {
      grStatusUpdate = {
        status: "draft",
        approvalId: null,
        returnedAt: new Date(),
        returnedBy: ctx.userId,
        returnReason: comments,
      };
    }
  });

  // Lost the claim — someone else settled it first. Nothing was written, so
  // return before the status patch below.
  if (conflict) {
    return NextResponse.json(
      await gateConflictResponse(conflict, "good return"),
      { status: 409 },
    );
  }

  if (grStatusUpdate) {
    await patchGoodReturnStatus(ctx.orgId, gr.id, {
      ...(grStatusUpdate as Parameters<typeof patchGoodReturnStatus>[2]),
      updatedBy: ctx.userId,
    });
  }

  const refreshed = await findGoodReturnById(ctx.orgId, gr.id);
  const refreshedInstance = await db.cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  if (!refreshedInstance) {
    return NextResponse.json({ error: "Approval instance not found" }, { status: 404 });
  }
  const totalSteps = await db.cnApprovalWorkflowStep.count({
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
