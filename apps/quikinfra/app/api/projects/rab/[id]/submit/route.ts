import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { assertTransition, TransitionError } from "@/lib/workflow/transitions";
import {
  submitForApproval,
  NoActiveWorkflowError,
} from "@/lib/approvals/submit-for-approval";

/**
 * Submit an RA Bill for approval (RA Bill Phase 5).
 *
 * Status transitions:
 *   draft    ──submit──> submitted   (+ approval instance created)
 *   returned ──submit──> submitted   (re-submit after a return)
 *
 * Mirrors the DPR submit route. Like DPR, the RAB never auto-approves its
 * last step on submit (`autoApprovedInstanceStatus: "pending_approval"`):
 * the billing-ledger posting happens only when the final step is approved
 * in /approve, so the instance must stay pending for a human approver.
 *
 * No billedQty change here — the ledger moves only on final approval.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.rab", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "pm.dpr", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for pm.dpr`, 403);
  }

  const rab = await db.cnRunningAccountBill.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
    select: {
      id: true,
      status: true,
      rabNumber: true,
      projectId: true,
      createdBy: true,
    },
  });
  if (!rab) {
    return NextResponse.json({ error: "RAB not found" }, { status: 404 });
  }

  try {
    assertTransition("rab", String(rab.status ?? "draft"), "submitted");
  } catch (e: unknown) {
    if (e instanceof TransitionError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    throw e;
  }

  const ownershipGuard = requireOwnership(rab, ctx, "RAB");
  if (ownershipGuard) return ownershipGuard;

  let instanceId: string;
  let autoApproved: boolean;
  try {
    ({ instanceId, autoApproved } = await submitForApproval({
      ctx: {
        orgId: ctx.orgId,
        userId: ctx.userId,
        roleKey: ctx.roleKey,
      },
      entityType: "rab",
      projectId: rab.projectId ?? null,
      entityId: rab.id,
      entityNumber: rab.rabNumber ?? rab.id,
      autoApprovedInstanceStatus: "pending_approval",
    }));
  } catch (err) {
    if (err instanceof NoActiveWorkflowError) {
      return NextResponse.json(
        {
          error:
            "No active RAB workflow is configured for this project. Ask an admin to create one under Settings → Workflows.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const updated = await db.cnRunningAccountBill.update({
    where: { id: rab.id },
    data: {
      status: "submitted",
      approvalId: instanceId,
      updatedBy: ctx.userId,
    },
  });

  return NextResponse.json({
    id: updated.id,
    rabNumber: updated.rabNumber,
    status: updated.status,
    approvalInstanceId: instanceId,
    autoApproved,
  });
}
