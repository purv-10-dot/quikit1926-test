import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { findCnUserById } from "@/lib/users/lookup";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { findPOById } from "@/lib/purchase/po-repository";
import { sendPoEmailToVendor } from "@/lib/purchase/po-email";
import {
  claimAndRecord,
  gateApprovalAction,
  gateConflictResponse,
  GATE_ACTIONS,
  type GateAction,
} from "@/lib/approvals/approval-gate";
import type { ClaimResult } from "@/lib/approvals/claim-instance";

/**
 * POST /api/purchase/orders/:id/approve — multi-step PO approval.
 *
 * Mirrors the PR / RFQ approve routes. The PO carries `approvalId`
 * pointing at its `CnApprovalInstance`. On each action we:
 *
 *   1. Validate the current user is the expected actor for the
 *      instance's current step.
 *   2. Record a history row.
 *   3. On "approve": advance to next step, or — if this was the final
 *      step — close the instance, flip status to "approved", and email
 *      the PO PDF to the vendor. The vendor email ONLY goes out at the
 *      final step so intermediate approvers can still reject/return
 *      without the vendor having seen the PO.
 *   4. On "reject" / "return": mark instance + PO accordingly. No
 *      vendor email ever goes out from a rejected flow.
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 */

type Action = GateAction;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.po", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "purchase.po", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.po`, 403);
  }

  let body: { action?: string; comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine for plain approve */
  }
  const action = (body.action ?? "approve") as Action;
  const comments = String(body.comments ?? "").trim();

  // Cheap input checks before any lookup, so a bad action is a 400 rather than
  // a 404 for an id we never needed. The gate re-checks both.
  if (!GATE_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
  if ((action === "reject" || action === "return") && !comments) {
    return NextResponse.json(
      { error: `Comments are required for ${action} actions` },
      { status: 400 },
    );
  }

  const po = await findPOById(ctx.orgId, params.id);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  if (!po.approvalId) {
    return NextResponse.json(
      { error: "This PO was not submitted through a workflow — no approval instance exists." },
      { status: 400 },
    );
  }

  const instance = await db.cnApprovalInstance.findFirst({
    where: { id: po.approvalId, orgId: ctx.orgId },
  });
  if (!instance) {
    return NextResponse.json({ error: "Approval instance not found" }, { status: 404 });
  }
  // Authorisation, step resolution and the repair / master-approval branches all
  // live in the shared gate; this route keeps only the PO's own status fields
  // and the vendor email.
  const gate = await gateApprovalAction({
    ctx,
    instance,
    entityLabel: "PO",
    action,
    comments,
    projectId: po.projectId ?? null,
  });
  if (gate.kind === "error") {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  let finalPOStatus: string | null = null;
  const isFinalApprove = gate.isFinalApprove;
  let conflict: ClaimResult["conflict"] | undefined;

  await db.$transaction(async (tx) => {
    const claim = await claimAndRecord(tx, ctx, instance, gate);
    if (!claim.claimed) {
      conflict = claim.conflict;
      return;
    }

    if (gate.effectiveAction === "approve") {
      if (gate.isFinalApprove) {
        await tx.cnPurchaseOrder.update({
          where: { id: po.id },
          data: { status: "approved", updatedBy: ctx.userId },
        });
        finalPOStatus = "approved";
      }
      // Intermediate — PO stays as it is; the gate advanced the instance.
    } else if (gate.effectiveAction === "reject") {
      await tx.cnPurchaseOrder.update({
        where: { id: po.id },
        data: { status: "rejected", updatedBy: ctx.userId },
      });
      finalPOStatus = "rejected";
    } else {
      await tx.cnPurchaseOrder.update({
        where: { id: po.id },
        data: { status: "draft", approvalId: null, updatedBy: ctx.userId },
      });
      finalPOStatus = "draft";
    }
  });

  // Lost the claim — someone else settled this PO first. Nothing was written, so
  // return before the vendor email below.
  if (conflict) {
    return NextResponse.json(await gateConflictResponse(conflict, "PO"), {
      status: 409,
    });
  }

  // Vendor email goes out ONLY at the final approve — never on
  // intermediate steps, reject, or return.
  let mailResult: Awaited<ReturnType<typeof sendPoEmailToVendor>> | null = null;
  if (isFinalApprove) {
    const updated = await findPOById(ctx.orgId, po.id);
    if (updated) {
      try {
        mailResult = await sendPoEmailToVendor(ctx.orgId, updated, {
          emailHtmlBody: null,
        });
        console.log(
          `[po:approve] mail to vendor for ${updated.poNumber}: ` +
            `sent=${mailResult.sent} email=${mailResult.email ?? "(none)"}${
              mailResult.skippedReason ? ` skipped="${mailResult.skippedReason}"` : ""
            }${mailResult.error ? ` error="${mailResult.error}"` : ""}`,
        );
      } catch (e: unknown) {
        console.warn(
          `[po:approve] mailer threw for ${updated.poNumber}:`,
          toErrorMessage(e),
        );
      }

      if (mailResult?.sent) {
        await db.cnPurchaseOrder.update({
          where: { id: po.id },
          data: { status: "sent", updatedBy: ctx.userId },
        });
        finalPOStatus = "sent";
      }
    }
  }

  const refreshed = await findPOById(ctx.orgId, po.id);
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
    po: refreshed,
    finalStatus: finalPOStatus,
    approval: {
      id: refreshedInstance.id,
      status: refreshedInstance.status,
      currentStepOrder: refreshedInstance.currentStepOrder,
      totalSteps,
    },
    mail: mailResult,
  });
}
