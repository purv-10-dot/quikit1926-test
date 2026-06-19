import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { postReconciliationAdjustment, StockError } from "@/lib/stock/ledger-service";
import type { TenantContext } from "@/lib/auth/context";

const withOrgAuth = withOrgAuthForModule("store");

/**
 * Reconciliation post: writes signed adjustment rows through the stock ledger
 * service.
 *   varianceQty > 0 → surplus found → qtyIn row
 *   varianceQty < 0 → shortage      → qtyOut row (absolute value)
 *   varianceQty = 0 → skip (no ledger row needed)
 *
 * `postReconciliationAdjustment` appends each CnStockLedger row AND keeps the
 * CnStockBalance cache in sync. Shortages that exceed the current balance are
 * rejected by the service guard (allowNegative defaults to false), so the
 * ledger and the balance can never disagree. This route must never write the
 * ledger directly. transactionType = "reconciliation_adj".
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const rec = await db.cnStockReconciliation.findFirst({
    where: { id: params.id, orgId },
    include: { lines: true },
  });
  if (!rec) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (rec.status === "posted") return NextResponse.json({ success: false, error: "Already posted" }, { status: 409 });

  // The stock service takes a TenantContext but only reads orgId/userId.
  const ctx = { orgId, userId } as TenantContext;
  const postedAt = new Date();

  try {
    await db.$transaction(async (tx) => {
      for (const line of rec.lines) {
        // Signed delta; the service writes the correct in/out leg and guards
        // shortages against the current balance.
        await postReconciliationAdjustment(tx, ctx, {
          projectId: rec.projectId,
          locationId: rec.locationId,
          itemId: line.itemId,
          uomId: line.uomId,
          signedQty: Number(line.varianceQty),
          refId: rec.id,
          refNumber: rec.reconciliationNumber,
          txDate: rec.reconciliationDate,
        });
      }
      await tx.cnStockReconciliation.update({
        where: { id: rec.id },
        data: { status: "posted", updatedBy: userId },
      });
    });
  } catch (err: unknown) {
    if (err instanceof StockError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.httpStatus },
      );
    }
    const msg = err instanceof Error ? err.message : "Posting failed";
    return NextResponse.json({ success: false, error: `Transaction failed: ${msg}` }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { id: rec.id, status: "posted", postedAt } });
}, { permission: { resource: "construction.reconciliation", action: "approve" } });
