import { NextRequest, NextResponse } from "next/server";
import { boqService, BOQError } from "@/lib/boq";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";
import { idempotencyGuard } from "@/lib/workflow/idempotency";
import { assertTransition, TransitionError } from "@/lib/workflow/transitions";
import { recordAudit } from "@/lib/workflow/audit";
import { rateLimit, LIMITS } from "@/lib/workflow/rate-limit";
import { logger } from "@/lib/observability/logger";
import { db } from "@/lib/db";

const auth = withOrgAuthForResource("construction.rab");

/**
 * RAB Approval — flips status to `approved` and applies billed qty to
 * BOQ leaves per spec §12 item #15.
 *
 * Hardening:
 *   - `rab.approve` permission gate
 *   - Idempotency-Key guard
 *   - One Prisma transaction wraps:
 *       (a) RAB status transition (draft/submitted → approved)
 *       (b) all line billings via BOQ billing ledger (with caps)
 *       (c) audit log
 *   - RAB billed qty ≤ cumulative approved done qty (sub+self), unless
 *     explicit override flag is set on the line.
 *
 * RAB itself is now Postgres-backed (was globalThis.__qcRABs).
 * `cn_rab_lines` rows are the source of truth for billed-per-BOQ-item
 * detail; the BOQ billing service expects a `boqNo` string, so we
 * resolve each `boqItemId` against `cn_boq_items_v2.boqNo` inside the
 * transaction.
 */
export const POST = auth.approve<{ id: string }>(async (
  _authCtx,
  req: NextRequest,
  { params },
) => {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await rateLimit({ ...LIMITS.APPROVAL, req, identifier: ctx.userId });
  if (limited.blocked) {
    logger.warn({ msg: "rate_limited", route: "rab.approve", userId: ctx.userId });
    return limited.response!;
  }

  const guard = await idempotencyGuard(req, ctx, "rab.approve");
  if (guard.cached) return guard.cachedResponse!;
  if (guard.conflict) return guard.conflictResponse!;

  try {
    const rab = await (db as any).cnRunningAccountBill.findFirst({
      where: { id: params.id, orgId: ctx.orgId },
      select: {
        id: true,
        status: true,
        projectId: true,
        lines: {
          select: {
            id: true,
            boqItemId: true,
            currentQty: true,
          },
        },
      },
    });
    if (!rab) {
      const body = { error: "RAB not found", code: "RAB_NOT_FOUND" };
      await guard.commit(404, body);
      return NextResponse.json(body, { status: 404 });
    }

    try {
      assertTransition("rab", rab.status ?? "draft", "approved");
    } catch (e: any) {
      if (e instanceof TransitionError) {
        const body = { error: e.message, code: e.code };
        await guard.commit(400, body);
        return NextResponse.json(body, { status: 400 });
      }
      throw e;
    }

    // Pre-resolve `boqItemId → boqNo` once outside the transaction so the
    // billing loop doesn't issue a `findUnique` per line while holding
    // transaction locks. Mirrors the pattern in dpr/[id]/approve.
    const boqItemIds = (rab.lines ?? [])
      .map((l: any) => l.boqItemId)
      .filter(Boolean);
    const boqNoById = new Map<string, string>();
    if (boqItemIds.length) {
      const boqRows = await (db as any).cnBOQItemV2.findMany({
        where: { id: { in: boqItemIds }, orgId: ctx.orgId, projectId: rab.projectId },
        select: { id: true, boqNo: true },
      });
      for (const r of boqRows as any[]) boqNoById.set(r.id, r.boqNo);
    }

    const updates: Array<{ boqNo: string; qty: number }> = [];

    const updatedRab = await db.$transaction(async (tx: any) => {
      // Apply BOQ billing for each line. The form doesn't yet capture
      // per-BOQ-item billing detail, so most production RABs will iterate
      // zero lines until that flow lands.
      for (const line of rab.lines ?? []) {
        const qty = Number(line.currentQty?.toString() ?? "0");
        if (qty <= 0) continue;

        const boqNo = boqNoById.get(line.boqItemId);
        if (!boqNo) continue;

        await boqService.applyRABBillingTxn(tx, ctx, rab.projectId, boqNo, qty, {
          rabId: rab.id,
          rabLineId: line.id,
        });

        updates.push({ boqNo, qty });
      }

      const updated = await tx.cnRunningAccountBill.update({
        where: { id: rab.id },
        data: {
          status: "approved",
          updatedBy: ctx.userId,
        },
      });

      await recordAudit(tx, ctx, {
        entityType: "rab",
        entityId: rab.id,
        action: "approve",
        changes: {
          from: rab.status,
          to: "approved",
          linesBilled: updates.length,
        },
      });

      return updated;
    });

    const responseBody = {
      success: true,
      rab: {
        id: updatedRab.id,
        rabNumber: updatedRab.rabNumber,
        status: updatedRab.status,
        currentBillAmount: updatedRab.currentBillAmount.toString(),
        cumulativeAmount: updatedRab.cumulativeAmount.toString(),
        netPayable: updatedRab.netPayable.toString(),
        updatedAt: updatedRab.updatedAt.toISOString(),
      },
      boqUpdatesApplied: updates.length,
      updates,
    };
    await guard.commit(200, responseBody);
    return NextResponse.json(responseBody);
  } catch (err: any) {
    if (err instanceof BOQError) {
      const body = { error: err.message, code: err.code };
      await guard.commit(err.httpStatus, body);
      return NextResponse.json(body, { status: err.httpStatus });
    }
    logger.error({ msg: "rab_approve_failed", rabId: params.id, err });
    return NextResponse.json(
      { error: err?.message ?? "Failed to approve RAB" },
      { status: 500 },
    );
  }
});
