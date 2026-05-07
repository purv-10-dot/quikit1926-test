import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/context";
import {
  findEstimationById,
  patchEstimationStatus,
} from "@/lib/projects/estimation-repository";
import { actOnApproval } from "@/lib/approvals/act-on-approval";

/**
 * POST /api/estimations/:id/approve
 *
 * Workflow-driven approval for Material Estimations. Workflow walk +
 * step actor check + history-row + instance update are delegated to
 * `actOnApproval`; this handler owns only the post-tx estimation
 * status patch (the estimation repository uses raw SQL and can't join
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

  const est = await findEstimationById(ctx.tenantId, params.id);
  if (!est) {
    return NextResponse.json(
      { error: "Estimation not found" },
      { status: 404 },
    );
  }

  let estStatusPatch: Record<string, unknown> | null = null;

  const outcome = await actOnApproval({
    ctx,
    entity: {
      id: est.id,
      approvalId: est.approvalId ?? null,
      projectId: est.projectId ?? null,
    },
    entityLabel: "estimation",
    action,
    comments,
    applyEntityPatch: async (_tx, args) => {
      if (args.phase === "intermediate-approve") return;
      if (args.phase === "final-approve") {
        estStatusPatch = {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
        };
      } else if (args.phase === "reject") {
        estStatusPatch = {
          status: "rejected",
          rejectedAt: new Date(),
          rejectedBy: ctx.userId,
          rejectionReason: args.comments,
        };
      } else {
        estStatusPatch = {
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

  if (estStatusPatch) {
    await patchEstimationStatus(ctx.tenantId, est.id, {
      ...(estStatusPatch as any),
      updatedBy: ctx.userId,
    });
  }

  const refreshed = await findEstimationById(ctx.tenantId, est.id);
  return NextResponse.json({
    ok: true,
    action,
    estimation: refreshed,
    approval: {
      id: outcome.instanceId,
      status: outcome.newInstanceStatus,
      currentStepOrder: outcome.newCurrentStepOrder,
      totalSteps: outcome.totalSteps,
    },
  });
}
