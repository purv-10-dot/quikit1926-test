import { requireEquipmentAction } from "@/lib/auth/requireEquipmentAction";
import { findCnUserById } from "@/lib/users/lookup";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  claimAndRecord,
  gateApprovalAction,
  gateConflictResponse,
  GATE_ACTIONS,
  type GateAction,
} from "@/lib/approvals/approval-gate";
import type { ClaimResult } from "@/lib/approvals/claim-instance";
import {
  findHireInVerificationRow,
  patchHireInVerificationWorkflowStatus,
} from "@/lib/equipment/hire-rent-service";

type Action = GateAction;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctxOrResp = await requireEquipmentAction(
    "construction.equipment_hire_rent",
    "approve",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "equip.hire_rent", "edit")) {
    return envelopeErr("FORBIDDEN", 'Action "edit" not allowed for equip.hire_rent', 403);
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
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
  if ((action === "reject" || action === "return") && !comments) {
    return NextResponse.json(
      { error: `Comments are required for ${action} actions` },
      { status: 400 },
    );
  }

  const { id } = await params;
  const verification = await findHireInVerificationRow(ctx.orgId, id);
  if (!verification) {
    return NextResponse.json({ error: "Verification not found" }, { status: 404 });
  }
  if (!verification.approvalId) {
    return NextResponse.json(
      {
        error:
          "This verification was not submitted through a workflow — no approval instance exists.",
      },
      { status: 400 },
    );
  }

  const instance = await db.cnApprovalInstance.findFirst({
    where: { id: verification.approvalId, orgId: ctx.orgId },
  });
  if (!instance) {
    return NextResponse.json({ error: "Approval instance not found" }, { status: 404 });
  }
  // Authorisation, step resolution and the repair / master-approval branches
  // live in the shared gate; this route keeps only the verification's own patch.
  const gate = await gateApprovalAction({
    ctx,
    instance,
    entityLabel: "verification",
    action,
    comments,
    projectId: verification.projectId ?? null,
  });
  if (gate.kind === "error") {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  let statusPatch: Parameters<typeof patchHireInVerificationWorkflowStatus>[2] | null = null;
  let conflict: ClaimResult["conflict"] | undefined;

  await db.$transaction(async (tx) => {
    const claim = await claimAndRecord(tx, ctx, instance, gate);
    if (!claim.claimed) {
      conflict = claim.conflict;
      return;
    }

    if (gate.effectiveAction === "approve") {
      if (gate.isFinalApprove) {
        statusPatch = {
          status: "approved",
          approvedAt: new Date(),
          approvedBy: ctx.userId,
          updatedBy: ctx.userId,
        };
      }
      // Intermediate — the verification stays as it is.
    } else if (gate.effectiveAction === "reject") {
      statusPatch = {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: ctx.userId,
        rejectReason: comments,
        updatedBy: ctx.userId,
      };
    } else {
      statusPatch = {
        status: "computed",
        approvalId: null,
        returnedAt: new Date(),
        returnedBy: ctx.userId,
        returnReason: comments,
        updatedBy: ctx.userId,
      };
    }
  });

  // Lost the claim — someone else settled it first. Nothing was written, so
  // return before the status patch below.
  if (conflict) {
    return NextResponse.json(
      await gateConflictResponse(conflict, "verification"),
      { status: 409 },
    );
  }

  const refreshed = statusPatch
    ? await patchHireInVerificationWorkflowStatus(ctx.orgId, verification.id, statusPatch)
    : await findHireInVerificationRow(ctx.orgId, verification.id).then((row) =>
        row ? { id: row.id, status: row.status } : null,
      );

  const refreshedInstance = await db.cnApprovalInstance.findUnique({
    where: { id: instance.id },
  });
  const totalSteps = await db.cnApprovalWorkflowStep.count({
    where: { workflowId: instance.workflowId },
  });

  return NextResponse.json({
    ok: true,
    action,
    verification: refreshed,
    approval: refreshedInstance
      ? {
          id: refreshedInstance.id,
          status: refreshedInstance.status,
          currentStepOrder: refreshedInstance.currentStepOrder,
          totalSteps,
        }
      : null,
  });
}
