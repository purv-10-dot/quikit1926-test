import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { findCnUserById } from "@/lib/users/lookup";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { idempotencyGuard } from "@/lib/workflow/idempotency";
import { assertTransition, TransitionError } from "@/lib/workflow/transitions";
import { recordAudit } from "@/lib/workflow/audit";
import { postGRNInward, StockError } from "@/lib/stock";
import { GRNStatus } from "@/lib/purchase/enums";
import { db } from "@/lib/db";
import {
  claimAndRecord,
  gateApprovalAction,
  gateConflictResponse,
  GATE_ACTIONS,
  type GateAction,
} from "@/lib/approvals/approval-gate";
import type { ClaimResult } from "@/lib/approvals/claim-instance";

/**
 * GRN Approval — multi-step workflow-driven.
 *
 * Authorization is now driven by the configured `CnApprovalWorkflow` step
 * (pinned user pool / role) — not a static `purchase.grn.approve`
 * permission key. The route gates on `requireAuth` + the matrix `edit`
 * action, then defers to `canActOnStep` for the actual approver check.
 *
 * Stock inward posting (`postGRNInward`) only runs on the FINAL step's
 * approve so intermediate approvers can still reject/return without
 * touching `cn_stock_ledger` or `cn_stock_balances`. Reject / return at
 * any level mark the instance + GRN appropriately and never post stock.
 *
 * Hardened steps preserved from the prior single-step handler:
 *   1. Auth + matrix gate
 *   2. Idempotency-Key guard (safe to retry)
 *   3. Workflow step authorization
 *   4. Status transition check (on final approve only)
 *   5. db.$transaction wraps: history row, instance update, GRN status
 *      flip, stock-ledger postings (final approve only), audit log
 *   6. Commit the guard with the final status + body so retries replay
 */

type Action = GateAction;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.grn", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "purchase.grn", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.grn`, 403);
  }

  const guard = await idempotencyGuard(req, ctx, "purchase.grn.approve");
  if (guard.cached) return guard.cachedResponse!;
  if (guard.conflict) return guard.conflictResponse!;

  // Read the payload off the guard, NOT `req.json()`. `idempotencyGuard`
  // already consumed the stream to hash it, so a second read throws and the
  // action silently fell back to "approve" — a reject landed as an approval,
  // stock included.
  const body = (guard.parsedBody ?? {}) as { action?: string; comments?: string };
  const action = (body.action ?? "approve") as Action;
  const comments = String(body.comments ?? "").trim();

  if (!GATE_ACTIONS.includes(action)) {
    const errBody = { error: `Unknown action: ${action}`, code: "INVALID_ACTION" };
    await guard.commit(400, errBody);
    return NextResponse.json(errBody, { status: 400 });
  }
  if ((action === "reject" || action === "return") && !comments) {
    const errBody = {
      error: `Comments are required for ${action} actions`,
      code: "COMMENT_REQUIRED",
    };
    await guard.commit(400, errBody);
    return NextResponse.json(errBody, { status: 400 });
  }

  try {
    // ─── Load GRN ─────────────────────────────────────────────────────
    const grn = await db.cnGoodsReceiptNote.findFirst({
      where: {
        orgId: ctx.orgId,
        OR: [{ id: params.id }, { grnNumber: params.id }],
      },
      include: { lines: true },
    });
    if (!grn) {
      const errBody = { error: "GRN not found", code: "GRN_NOT_FOUND" };
      await guard.commit(404, errBody);
      return NextResponse.json(errBody, { status: 404 });
    }

    if (!grn.approvalId) {
      const errBody = {
        error:
          "This GRN was not submitted through a workflow — no approval instance exists.",
        code: "NO_APPROVAL_INSTANCE",
      };
      await guard.commit(400, errBody);
      return NextResponse.json(errBody, { status: 400 });
    }

    const instance = await db.cnApprovalInstance.findFirst({
      where: { id: grn.approvalId, orgId: ctx.orgId },
    });
    if (!instance) {
      const errBody = {
        error: "Approval instance not found",
        code: "INSTANCE_NOT_FOUND",
      };
      await guard.commit(404, errBody);
      return NextResponse.json(errBody, { status: 404 });
    }
    // ─── Workflow-step authorization ─────────────────────────────────
    // Authorisation, step resolution and the repair / master-approval branches
    // live in the shared gate; this route keeps only the stock posting and the
    // GRN's own status transition. Errors still go through the idempotency
    // guard so a replay returns the same response.
    const gate = await gateApprovalAction({
      ctx,
      instance,
      entityLabel: "GRN",
      action,
      comments,
      projectId: grn.projectId ?? null,
    });
    if (gate.kind === "error") {
      await guard.commit(gate.status, gate.body);
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const isFinalApprove = gate.isFinalApprove;

    // Status-transition check only when we'd actually flip the GRN to
    // APPROVED (final step). Intermediate steps stay at pending_approval.
    if (isFinalApprove) {
      try {
        assertTransition("grn", grn.status ?? "draft", GRNStatus.APPROVED);
      } catch (e: unknown) {
        if (e instanceof TransitionError) {
          const errBody = { error: e.message, code: e.code };
          await guard.commit(400, errBody);
          return NextResponse.json(errBody, { status: 400 });
        }
        throw e;
      }
    }

    // ─── Stock payload (only used on final approve) ───────────────────
    const lines = (grn.lines ?? []).map((l) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      acceptedQty: Number(l.acceptedQty?.toString?.() ?? l.acceptedQty ?? 0),
      unitRate: Number(l.unitRate?.toString?.() ?? l.unitRate ?? 0),
    }));

    let postings: Array<{ ledgerId: string; itemId: string; balanceAfter: number }> = [];
    let finalGrnStatus = grn.status;

    let conflict: ClaimResult["conflict"] | undefined;

    await db.$transaction(async (tx) => {
      const claim = await claimAndRecord(tx, ctx, instance, gate);
      if (!claim.claimed) {
        conflict = claim.conflict;
        return;
      }

      if (gate.effectiveAction === "approve") {
        if (gate.isFinalApprove) {
          // Credit inward stock — single source of truth for GRN-driven
          // stock postings. Skipped on intermediate approvals.
          postings = await postGRNInward(tx, ctx, {
            id: grn.id,
            grnNumber: grn.grnNumber,
            projectId: grn.projectId,
            locationId: grn.storageLocationId ?? grn.locationId,
            lines,
          });
          const updated = await tx.cnGoodsReceiptNote.update({
            where: { id: grn.id },
            data: { status: GRNStatus.APPROVED, updatedBy: ctx.userId },
          });
          finalGrnStatus = updated.status;
          await recordAudit(tx, ctx, {
            entityType: "grn",
            entityId: grn.id,
            action: "approve",
            changes: {
              from: grn.status,
              to: GRNStatus.APPROVED,
              linesPosted: postings.length,
            },
          });
        } else {
          // Intermediate step — the gate already advanced the instance.
          await recordAudit(tx, ctx, {
            entityType: "grn",
            entityId: grn.id,
            action: "approve",
            changes: {
              stepFrom: instance.currentStepOrder,
              stepTo: gate.nextStepOrder,
            },
          });
        }
      } else if (gate.effectiveAction === "reject") {
        const updated = await tx.cnGoodsReceiptNote.update({
          where: { id: grn.id },
          data: { status: "rejected", updatedBy: ctx.userId },
        });
        finalGrnStatus = updated.status;
        await recordAudit(tx, ctx, {
          entityType: "grn",
          entityId: grn.id,
          action: "reject",
          changes: { from: grn.status, to: "rejected", reason: comments },
        });
      } else {
        const updated = await tx.cnGoodsReceiptNote.update({
          where: { id: grn.id },
          data: { status: "draft", approvalId: null, updatedBy: ctx.userId },
        });
        finalGrnStatus = updated.status;
        await recordAudit(tx, ctx, {
          entityType: "grn",
          entityId: grn.id,
          action: "return",
          changes: { from: grn.status, to: "draft", reason: comments },
        });
      }
    });

    // Lost the claim — someone else settled this GRN first. Nothing was
    // written, so no stock was posted by this request.
    if (conflict) {
      const errBody = await gateConflictResponse(conflict, "GRN");
      await guard.commit(409, errBody);
      return NextResponse.json(errBody, { status: 409 });
    }

    const refreshedInstance = await db.cnApprovalInstance.findUnique({
      where: { id: instance.id },
    });
    if (!refreshedInstance) {
      return NextResponse.json({ error: "Approval instance not found" }, { status: 404 });
    }
    const totalSteps = await db.cnApprovalWorkflowStep.count({
      where: { workflowId: instance.workflowId },
    });

    const responseBody = {
      ok: true,
      action,
      grn: {
        id: grn.id,
        grnNumber: grn.grnNumber,
        status: finalGrnStatus,
      },
      approval: {
        id: refreshedInstance.id,
        status: refreshedInstance.status,
        currentStepOrder: refreshedInstance.currentStepOrder,
        totalSteps,
      },
      linesPosted: postings.length,
      postings,
    };
    await guard.commit(200, responseBody);
    return NextResponse.json(responseBody);
  } catch (err: unknown) {
    if (err instanceof StockError) {
      const errBody = { error: err.message, code: err.code };
      await guard.commit(err.httpStatus, errBody);
      return NextResponse.json(errBody, { status: err.httpStatus });
    }
    // 5xx — do NOT commit guard, allow retry
    return NextResponse.json(
      { error: toErrorMessage(err, "Internal error") },
      { status: 500 },
    );
  }
}
