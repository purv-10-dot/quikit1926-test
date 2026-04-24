import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("store");

/**
 * Reconciliation post: writes adjustment rows.
 *   adjustmentQty > 0 → extra found → qtyIn row
 *   adjustmentQty < 0 → shortage    → qtyOut row (absolute value)
 *   adjustmentQty = 0 → skip (no ledger row needed)
 * transactionType = "reconciliation_adj".
 */
export const POST = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const rec = await db.cnStockReconciliation.findFirst({
    where: { id: params.id, tenantId, deletedAt: null },
    include: { lines: true },
  });
  if (!rec) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (rec.status === "posted") return NextResponse.json({ success: false, error: "Already posted" }, { status: 409 });

  // For shortages, also validate we have that much to remove
  const insufficient: Array<{ itemId: string; available: number; requested: number }> = [];
  for (const line of rec.lines) {
    const adj = Number(line.adjustmentQty);
    if (adj < 0) {
      const agg = await db.cnStockLedger.aggregate({
        where: { tenantId, projectId: rec.projectId, locationId: rec.locationId, itemId: line.itemId },
        _sum: { qtyIn: true, qtyOut: true },
      });
      const available = Number(agg._sum.qtyIn ?? 0) - Number(agg._sum.qtyOut ?? 0);
      if (available < Math.abs(adj)) {
        insufficient.push({ itemId: line.itemId, available, requested: Math.abs(adj) });
      }
    }
  }
  if (insufficient.length) {
    return NextResponse.json({ success: false, error: "Shortage exceeds available stock", details: insufficient }, { status: 400 });
  }

  const postedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      for (const line of rec.lines) {
        const adj = Number(line.adjustmentQty);
        if (adj === 0) continue;
        await tx.cnStockLedger.create({
          data: {
            tenantId,
            projectId: rec.projectId,
            locationId: rec.locationId,
            itemId: line.itemId,
            transactionType: "reconciliation_adj",
            transactionRefId: rec.id,
            transactionRefNumber: rec.reconciliationNumber,
            transactionDate: rec.reconciliationDate,
            qtyIn: adj > 0 ? adj : 0,
            qtyOut: adj < 0 ? Math.abs(adj) : 0,
            unitRate: line.unitRate,
            amount: line.amount,
            uomId: line.uomId,
            createdBy: userId,
          },
        });
      }
      await tx.cnStockReconciliation.update({
        where: { id: rec.id },
        data: { status: "posted", postedAt, postedBy: userId, updatedBy: userId },
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Posting failed";
    return NextResponse.json({ success: false, error: `Transaction failed: ${msg}` }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { id: rec.id, status: "posted", postedAt } });
});
