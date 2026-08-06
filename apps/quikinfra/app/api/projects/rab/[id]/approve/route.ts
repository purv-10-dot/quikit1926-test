import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
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
import { boqService, BOQError } from "@/lib/boq";
import { recordAudit } from "@/lib/workflow/audit";
import { idempotencyGuard } from "@/lib/workflow/idempotency";
import { rateLimit, LIMITS } from "@/lib/workflow/rate-limit";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/projects/rab/:id/approve  (RA Bill Phase 5)
 *
 * Workflow-driven approval for RA Bills. Mirrors the DPR/WO approve
 * step-walk, plus the billing-ledger posting on the final approve step:
 *
 *   pending_approval ──approve (intermediate)──> pending_approval (next step)
 *   pending_approval ──approve (last step)─────> approved + billedQty posted
 *   pending_approval ──reject─────────────────> rejected
 *   pending_approval ──return─────────────────> draft (approvalId cleared)
 *
 * Body: { action: "approve" | "reject" | "return", comments? }
 *
 * The ledger posting (`billedQty += currentQty` per line) happens ONLY on
 * final approval, inside the same transaction as the status change and
 * audit, and is wrapped in an idempotencyGuard so a retried request never
 * double-posts. The BOQ billing ledger also clamps each line to its
 * un-billed balance, so double-billing is impossible even on replay.
 */

type Action = GateAction;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.rab", "approve");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  if (!hasMatrixAction(ctx, "pm.dpr", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for pm.dpr`, 403);
  }

  const limited = await rateLimit({ ...LIMITS.APPROVAL, req, identifier: ctx.userId });
  if (limited.blocked) {
    logger.warn({ msg: "rate_limited", route: "rab.approve", userId: ctx.userId });
    return limited.response!;
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

  const guard = await idempotencyGuard(req, ctx, "rab.approve");
  if (guard.cached) return guard.cachedResponse!;
  if (guard.conflict) return guard.conflictResponse!;

  try {
    const rab = await db.cnRunningAccountBill.findFirst({
      where: { id: params.id, orgId: ctx.orgId },
      select: {
        id: true,
        rabNumber: true,
        status: true,
        approvalId: true,
        projectId: true,
        lines: {
          select: { id: true, boqItemId: true, currentQty: true },
        },
      },
    });
    if (!rab) {
      const b = { error: "RAB not found", code: "RAB_NOT_FOUND" };
      await guard.commit(404, b);
      return NextResponse.json(b, { status: 404 });
    }
    if (!rab.approvalId) {
      const b = {
        error:
          "This RAB was not submitted through a workflow — no approval instance exists.",
      };
      await guard.commit(400, b);
      return NextResponse.json(b, { status: 400 });
    }

    const instance = await db.cnApprovalInstance.findFirst({
      where: { id: rab.approvalId, orgId: ctx.orgId },
    });
    if (!instance) {
      const b = { error: "Approval instance not found" };
      await guard.commit(404, b);
      return NextResponse.json(b, { status: 404 });
    }
    // Authorisation, step resolution and the repair / master-approval branches
    // live in the shared gate; this route keeps only the BOQ billing posts and
    // the RAB's own status. Errors still go through the idempotency guard so a
    // replay returns the same response.
    const gate = await gateApprovalAction({
      ctx,
      instance,
      entityLabel: "RAB",
      action,
      comments,
      projectId: rab.projectId ?? null,
    });
    if (gate.kind === "error") {
      await guard.commit(gate.status, gate.body);
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const isFinalApprove = gate.isFinalApprove;

    // Pre-resolve boqItemId → boqNo once (the billing service keys on boqNo),
    // only when we're about to post on final approve.
    const boqNoById = new Map<string, string>();
    if (isFinalApprove) {
      const boqItemIds = (rab.lines ?? [])
        .map((l) => l.boqItemId)
        .filter((v): v is string => !!v);
      if (boqItemIds.length) {
        const boqRows = await db.cnBOQItemV2.findMany({
          where: { id: { in: boqItemIds }, orgId: ctx.orgId, projectId: rab.projectId },
          select: { id: true, boqNo: true },
        });
        for (const r of boqRows) boqNoById.set(r.id, r.boqNo);
      }
    }

    let rabStatusUpdate: Record<string, unknown> | null = null;
    let finalStatus: string = String(rab.status ?? "");
    const updates: Array<{ boqNo: string; qty: number }> = [];

    let conflict: ClaimResult["conflict"] | undefined;

    await db.$transaction(async (tx) => {
      const claim = await claimAndRecord(tx, ctx, instance, gate);
      if (!claim.claimed) {
        conflict = claim.conflict;
        return;
      }

      if (gate.effectiveAction === "approve") {
        if (gate.isFinalApprove) {
          // Final step → post billedQty per line in this same transaction. The
          // billing ledger clamps to the un-billed balance, so a replay (or
          // overlapping bill) can never over-post.
          for (const line of rab.lines ?? []) {
            const qty = Number(line.currentQty?.toString() ?? "0");
            if (qty <= 0) continue;
            const boqNo = line.boqItemId ? boqNoById.get(line.boqItemId) : null;
            if (!boqNo) continue;

            await boqService.applyRABBillingTxn(tx, ctx, rab.projectId, boqNo, qty, {
              rabId: rab.id,
              rabLineId: line.id,
            });
            updates.push({ boqNo, qty });
          }

          await recordAudit(tx, ctx, {
            entityType: "rab",
            entityId: rab.id,
            action: "approve",
            changes: {
              from: rab.status,
              to: "approved",
              linesBilled: updates.length,
              comments: comments || undefined,
            },
          });

          rabStatusUpdate = { status: "approved", updatedBy: ctx.userId };
          finalStatus = "approved";
        }
        // Intermediate approve — the gate advanced the instance; the RAB stays
        // submitted and no ledger row is written.
      } else if (gate.effectiveAction === "reject") {
        await recordAudit(tx, ctx, {
          entityType: "rab",
          entityId: rab.id,
          action: "reject",
          changes: { from: rab.status, to: "rejected", comments },
        });
        rabStatusUpdate = { status: "rejected", updatedBy: ctx.userId };
        finalStatus = "rejected";
      } else {
        // "return" — back to draft for the raiser to edit; clearing
        // approvalId means the next submit creates a fresh instance.
        await recordAudit(tx, ctx, {
          entityType: "rab",
          entityId: rab.id,
          action: "return",
          changes: { from: rab.status, to: "draft", comments },
        });
        rabStatusUpdate = { status: "draft", approvalId: null, updatedBy: ctx.userId };
        finalStatus = "draft";
      }
    });

    // Lost the claim — someone else settled this RAB first. Nothing was
    // written, so no billing was posted by this request.
    if (conflict) {
      const b = await gateConflictResponse(conflict, "RAB");
      await guard.commit(409, b);
      return NextResponse.json(b, { status: 409 });
    }

    if (rabStatusUpdate) {
      await db.cnRunningAccountBill.update({
        where: { id: rab.id },
        data: rabStatusUpdate,
      });
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
      rab: {
        id: rab.id,
        rabNumber: rab.rabNumber,
        status: finalStatus,
      },
      approval: {
        id: refreshedInstance.id,
        status: refreshedInstance.status,
        currentStepOrder: refreshedInstance.currentStepOrder,
        totalSteps,
      },
      boqUpdatesApplied: updates.length,
      updates,
    };
    await guard.commit(200, responseBody);
    return NextResponse.json(responseBody);
  } catch (err: unknown) {
    if (err instanceof BOQError) {
      const b = { error: err.message, code: err.code };
      await guard.commit(err.httpStatus, b);
      return NextResponse.json(b, { status: err.httpStatus });
    }
    logger.error({ msg: "rab_approve_failed", rabId: params.id, err });
    return NextResponse.json(
      { error: toErrorMessage(err) ?? "Failed to approve RAB" },
      { status: 500 },
    );
  }
}
