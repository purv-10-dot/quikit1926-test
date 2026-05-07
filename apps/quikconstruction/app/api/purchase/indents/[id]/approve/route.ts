import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/context";
import { findIndentById } from "@/lib/purchase/indent-repository";
import { actOnApproval } from "@/lib/approvals/act-on-approval";

/**
 * POST /api/purchase/indents/:id/approve
 *
 * Workflow-driven approval. Workflow walk + step actor check +
 * history-row + instance update are delegated to `actOnApproval`; the
 * indent row is patched INSIDE the same transaction (atomic with the
 * instance update) via the `applyEntityPatch` callback.
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

  const indent = await findIndentById(ctx.tenantId, params.id);
  if (!indent) return NextResponse.json({ error: "Indent not found" }, { status: 404 });

  const outcome = await actOnApproval({
    ctx,
    entity: {
      id: indent.id,
      approvalId: indent.approvalId ?? null,
      projectId: indent.projectId ?? null,
    },
    entityLabel: "indent",
    action,
    comments,
    applyEntityPatch: async (tx, args) => {
      if (args.phase === "intermediate-approve") return;
      if (args.phase === "final-approve") {
        await tx.cnPurchaseIndent.update({
          where: { id: indent.id },
          data: { status: "approved", updatedBy: ctx.userId },
        });
      } else if (args.phase === "reject") {
        await tx.cnPurchaseIndent.update({
          where: { id: indent.id },
          data: { status: "rejected", updatedBy: ctx.userId },
        });
      } else {
        await tx.cnPurchaseIndent.update({
          where: { id: indent.id },
          data: { status: "draft", approvalId: null, updatedBy: ctx.userId },
        });
      }
    },
  });

  if (outcome.kind === "error") {
    return NextResponse.json(outcome.body, { status: outcome.status });
  }

  const refreshed = await findIndentById(ctx.tenantId, indent.id);
  return NextResponse.json({
    ok: true,
    action,
    indent: refreshed,
    approval: {
      id: outcome.instanceId,
      status: outcome.newInstanceStatus,
      currentStepOrder: outcome.newCurrentStepOrder,
      totalSteps: outcome.totalSteps,
    },
  });
}
