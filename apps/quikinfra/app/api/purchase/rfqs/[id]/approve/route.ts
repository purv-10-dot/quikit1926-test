import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { findCnUserById } from "@/lib/users/lookup";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { findRfqById } from "@/lib/purchase/rfq-repository";
import { sendRfqEmailsToVendors } from "@/lib/purchase/rfq-email";
import {
  claimAndRecord,
  gateApprovalAction,
  gateConflictResponse,
  GATE_ACTIONS,
  type GateAction,
} from "@/lib/approvals/approval-gate";
import type { ClaimResult } from "@/lib/approvals/claim-instance";

/**
 * POST /api/purchase/rfqs/:id/approve — multi-step RFQ approval.
 *
 * Mirrors the PR approve route. The RFQ carries `approvalId` pointing
 * at its `CnApprovalInstance`. On each action we:
 *
 *   1. Validate the current user is the expected actor for the
 *      instance's current step.
 *   2. Record a history row.
 *   3. On "approve": advance to next step, or — if this was the final
 *      step — close the instance, flip status to "approved", and fan
 *      out the RFQ PDF to every attached vendor. Vendor emails ONLY
 *      go out at the final step so intermediate approvers can still
 *      reject/return without vendors having seen the RFQ.
 *   4. On "reject" / "return": mark instance + RFQ accordingly. No
 *      vendor emails ever go out from a rejected flow.
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 */

type Action = GateAction;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.rfq", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "purchase.rfq", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.rfq`, 403);
  }

  let body: { action?: string; comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine for plain approve */
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

  const rfq = await findRfqById(ctx.orgId, params.id);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  if (!rfq.approvalId) {
    return NextResponse.json(
      { error: "This RFQ was not submitted through a workflow — no approval instance exists." },
      { status: 400 },
    );
  }

  const instance = await db.cnApprovalInstance.findFirst({
    where: { id: rfq.approvalId, orgId: ctx.orgId },
  });
  if (!instance) {
    return NextResponse.json({ error: "Approval instance not found" }, { status: 404 });
  }
  // Authorisation, step resolution and the repair / master-approval branches
  // live in the shared gate; this route keeps only the RFQ's own fields and the
  // vendor fan-out.
  const gate = await gateApprovalAction({
    ctx,
    instance,
    entityLabel: "RFQ",
    action,
    comments,
    projectId: rfq.projectId ?? null,
  });
  if (gate.kind === "error") {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  let finalRfqStatus: string | null = null;
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
        await tx.cnRfq.update({
          where: { id: rfq.id },
          data: { status: "approved", updatedBy: ctx.userId },
        });
        finalRfqStatus = "approved";
      }
      // Intermediate — RFQ stays as it is; the gate advanced the instance.
    } else if (gate.effectiveAction === "reject") {
      await tx.cnRfq.update({
        where: { id: rfq.id },
        data: { status: "rejected", updatedBy: ctx.userId },
      });
      finalRfqStatus = "rejected";
    } else {
      await tx.cnRfq.update({
        where: { id: rfq.id },
        data: { status: "draft", approvalId: null, updatedBy: ctx.userId },
      });
      finalRfqStatus = "draft";
    }
  });

  // Lost the claim — someone else settled this RFQ first. Nothing was written,
  // so return before the vendor fan-out below.
  if (conflict) {
    return NextResponse.json(await gateConflictResponse(conflict, "RFQ"), {
      status: 409,
    });
  }

  // Fan out the RFQ PDF to vendors ONLY at final approve — never on
  // intermediate steps, reject, or return. This is the whole point of
  // the multi-level workflow: vendors should not see the RFQ until
  // every approver has signed off.
  let emailResult: Awaited<ReturnType<typeof sendRfqEmailsToVendors>> | null =
    null;
  if (isFinalApprove) {
    const updated = await findRfqById(ctx.orgId, rfq.id);
    if (updated) {
      try {
        // Default per-vendor template — the raiser's cover-text override
        // captured on submit isn't persisted today (no schema column),
        // so the final approver's fan-out always uses the default.
        emailResult = await sendRfqEmailsToVendors(ctx.orgId, updated, {
          emailHtmlBodies: null,
        });
        console.log(
          `[rfq:approve] mail fan-out for ${updated.rfqNumber}: ` +
            `sent=${emailResult.sent.length} ` +
            `skipped=${emailResult.skipped.length} ` +
            `failed=${emailResult.failed.length}`,
        );
      } catch (e: unknown) {
        console.warn(
          `[rfq:approve] mail fan-out threw for ${updated.rfqNumber}:`,
          toErrorMessage(e),
        );
      }

      // Once at least one mail has left, advance approved → sent so the
      // status chip reflects reality. Also clear the staged cover bodies.
      if (emailResult && emailResult.sent.length > 0) {
        await db.cnRfq.update({
          where: { id: rfq.id },
          data: { status: "sent", updatedBy: ctx.userId },
        });
        finalRfqStatus = "sent";
      }
    }
  }

  const refreshed = await findRfqById(ctx.orgId, rfq.id);
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
    rfq: refreshed,
    finalStatus: finalRfqStatus,
    approval: {
      id: refreshedInstance.id,
      status: refreshedInstance.status,
      currentStepOrder: refreshedInstance.currentStepOrder,
      totalSteps,
    },
    mail: emailResult,
  });
}
