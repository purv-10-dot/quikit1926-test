import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("store");

/**
 * POST /api/store/stock-transfer/[id]/post
 *
 * Posts BOTH legs of the transfer atomically:
 *   - transfer_out at fromLocation (qtyOut)
 *   - transfer_in at toLocation   (qtyIn)
 *
 * Only valid if source has sufficient stock. Both ledger rows share the same
 * transactionRefId so reconciliation reports can pair them.
 */
export const POST = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const tr = await db.cnStockTransfer.findFirst({
    where: { id: params.id, tenantId, deletedAt: null },
    include: { lines: true },
  });
  if (!tr) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (tr.status === "received") return NextResponse.json({ success: false, error: "Already posted" }, { status: 409 });

  // Source-balance pre-check
  const insufficient: Array<{ itemId: string; available: number; requested: number }> = [];
  for (const line of tr.lines) {
    const agg = await db.cnStockLedger.aggregate({
      where: { tenantId, projectId: tr.projectId, locationId: tr.fromLocationId, itemId: line.itemId },
      _sum: { qtyIn: true, qtyOut: true },
    });
    const available = Number(agg._sum.qtyIn ?? 0) - Number(agg._sum.qtyOut ?? 0);
    if (available < Number(line.quantity)) {
      insufficient.push({ itemId: line.itemId, available, requested: Number(line.quantity) });
    }
  }
  if (insufficient.length) {
    return NextResponse.json({ success: false, error: "Insufficient stock at source", details: insufficient }, { status: 400 });
  }

  const postedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      for (const line of tr.lines) {
        // OUT at source
        await tx.cnStockLedger.create({
          data: {
            tenantId,
            projectId: tr.projectId,
            locationId: tr.fromLocationId,
            itemId: line.itemId,
            transactionType: "transfer_out",
            transactionRefId: tr.id,
            transactionRefNumber: tr.transferNumber,
            transactionDate: tr.transferDate,
            qtyIn: 0,
            qtyOut: line.quantity,
            unitRate: line.unitRate,
            amount: line.amount,
            uomId: line.uomId,
            createdBy: userId,
          },
        });
        // IN at destination (same refId so they pair up)
        await tx.cnStockLedger.create({
          data: {
            tenantId,
            projectId: tr.projectId,
            locationId: tr.toLocationId,
            itemId: line.itemId,
            transactionType: "transfer_in",
            transactionRefId: tr.id,
            transactionRefNumber: tr.transferNumber,
            transactionDate: tr.transferDate,
            qtyIn: line.quantity,
            qtyOut: 0,
            unitRate: line.unitRate,
            amount: line.amount,
            uomId: line.uomId,
            createdBy: userId,
          },
        });
      }
      await tx.cnStockTransfer.update({
        where: { id: tr.id },
        data: { status: "received", receivedAt: postedAt, updatedBy: userId },
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Posting failed";
    return NextResponse.json({ success: false, error: `Transaction failed: ${msg}` }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { id: tr.id, status: "received", receivedAt: postedAt } });
});
