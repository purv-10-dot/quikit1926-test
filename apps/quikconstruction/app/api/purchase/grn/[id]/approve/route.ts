import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/context";
import { idempotencyGuard } from "@/lib/workflow/idempotency";
import { assertTransition, TransitionError } from "@/lib/workflow/transitions";
import { recordAudit } from "@/lib/workflow/audit";
import {
  postGRNInward,
  StockError,
} from "@/lib/stock";
import { GRNStatus } from "@/lib/purchase/enums";
import { db } from "@/lib/db/prisma";

/**
 * GRN Approval — the canonical hardened stock-inward workflow.
 *
 * Shape every critical approval handler should follow:
 *
 *   1. Permission gate via `requirePermission`
 *   2. Idempotency-Key guard (safe to retry)
 *   3. Status transition check (reject illegal states BEFORE touching data)
 *   4. db.$transaction wraps:
 *        (a) GRN status flip on `goods_receipt_notes`
 *        (b) stock-ledger postings (`stock_ledger` append-only)
 *        (c) balance upserts (`stock_balances`)
 *        (d) audit log (`audit_logs`)
 *      → either all succeed or Postgres rolls back the whole thing.
 *   5. Commit the guard with the final status + body so retries replay.
 *   6. 5xx does NOT commit the guard (retries should re-execute).
 *
 * Business rules enforced:
 *   - GRN approval is the ONLY event that credits inward stock.
 *   - Accepted qty per line was already capped at PO pending qty when the
 *     GRN was created (see app/api/purchase/grn/route.ts).
 *   - `stock_ledger` is append-only; reversals post compensating rows.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResponse = await requirePermission("purchase.grn.approve");
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const guard = await idempotencyGuard(req, ctx, "purchase.grn.approve");
  if (guard.cached) return guard.cachedResponse!;
  if (guard.conflict) return guard.conflictResponse!;

  try {
    // ─── Load GRN from Postgres (tenant-scoped, with lines) ──────────
    // The route param is usually the GRN id, but the legacy URL pattern
    // also passed the grnNumber occasionally — accept either so live URLs
    // don't break.
    const grn = await (db as any).cnGoodsReceiptNote.findFirst({
      where: {
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        OR: [{ id: params.id }, { grnNumber: params.id }],
      },
      include: { lines: true },
    });
    if (!grn) {
      const body = { error: "GRN not found", code: "GRN_NOT_FOUND" };
      await guard.commit(404, body);
      return NextResponse.json(body, { status: 404 });
    }

    // ─── Status transition ────────────────────────────────────────────
    try {
      assertTransition("grn", grn.status ?? "draft", GRNStatus.APPROVED);
    } catch (e: unknown) {
      const ne = e as { code?: string; message?: string };
      if (e instanceof TransitionError) {
        const body = { error: ne.message, code: ne.code };
        await guard.commit(400, body);
        return NextResponse.json(body, { status: 400 });
      }
      throw e;
    }

    // ─── Build the stock-service payload from GRN lines ──────────────
    const lines = (grn.lines ?? []).map((l: any) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      acceptedQty: Number(l.acceptedQty?.toString?.() ?? l.acceptedQty ?? 0),
      unitRate: Number(l.unitRate?.toString?.() ?? l.unitRate ?? 0),
    }));

    // ─── One atomic transaction ──────────────────────────────────────
    let postings: Array<{ ledgerId: string; itemId: string; balanceAfter: number }> = [];
    let updatedGrn: any;

    await db.$transaction(async (tx: any) => {
      // 1. Credit inward stock for every accepted line
      postings = await postGRNInward(tx, ctx, {
        id: grn.id,
        grnNumber: grn.grnNumber,
        projectId: grn.projectId,
        locationId: grn.storageLocationId ?? grn.locationId,
        lines,
      });

      // 2. Flip the GRN's own status in the same txn
      updatedGrn = await tx.cnGoodsReceiptNote.update({
        where: { id: grn.id },
        data: {
          status: GRNStatus.APPROVED,
          updatedBy: ctx.userId,
        },
      });

      // 3. Envelope audit (the ledger service already audits each posting)
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
    });

    const responseBody = {
      success: true,
      grn: {
        id: updatedGrn.id,
        grnNumber: updatedGrn.grnNumber,
        status: updatedGrn.status,
        updatedAt: updatedGrn.updatedAt.toISOString(),
      },
      linesPosted: postings.length,
      postings,
    };
    await guard.commit(200, responseBody);
    return NextResponse.json(responseBody);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (err instanceof StockError) {
      const body = { error: e.message, code: e.code };
      await guard.commit(err.httpStatus, body);
      return NextResponse.json(body, { status: err.httpStatus });
    }
    // 5xx — do NOT commit guard, allow retry
    return NextResponse.json(
      { error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
