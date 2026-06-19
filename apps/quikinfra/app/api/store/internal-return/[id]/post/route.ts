import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { postLedgerEntry, LEDGER_TX_TYPES, StockError } from "@/lib/stock/ledger-service";
import type { TenantContext } from "@/lib/auth/context";

const withOrgAuth = withOrgAuthForModule("store");

/**
 * Internal Return posting: stock comes BACK IN (qtyIn > 0) at the issue
 * location via the stock ledger service. `postLedgerEntry` appends the
 * CnStockLedger row AND keeps the CnStockBalance cache in sync. The return
 * line carries no rate, so each line re-enters at the location's current
 * moving-average rate — adding quantity without shifting the average (no
 * dilution). transactionType = "return_internal". This route must never
 * write the ledger directly.
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const ret = await db.cnInternalReturn.findFirst({
    where: { id: params.id, orgId },
    include: { lines: true },
  });
  if (!ret) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (ret.status === "posted") return NextResponse.json({ success: false, error: "Already posted" }, { status: 409 });

  // The stock service takes a TenantContext but only reads orgId/userId.
  const ctx = { orgId, userId } as TenantContext;
  const postedAt = new Date();

  try {
    await db.$transaction(async (tx) => {
      for (const line of ret.lines) {
        const qty = Number(line.returnedQty);
        if (qty <= 0) continue;

        // Re-enter at the location's current moving-average rate so the
        // return is value-neutral (avgRate unchanged).
        const bal = await tx.cnStockBalance.findUnique({
          where: {
            projectId_locationId_itemId: {
              projectId: ret.projectId,
              locationId: ret.locationId,
              itemId: line.itemId,
            },
          },
        });
        const unitRate = bal ? Number(bal.avgRate.toString()) : 0;

        await postLedgerEntry(tx, ctx, {
          projectId: ret.projectId,
          locationId: ret.locationId,
          itemId: line.itemId,
          uomId: line.uomId,
          qty,
          unitRate,
          txType: LEDGER_TX_TYPES.RETURN_INTERNAL,
          refId: ret.id,
          refNumber: ret.returnNumber,
          txDate: ret.returnDate,
        });
      }
      await tx.cnInternalReturn.update({
        where: { id: ret.id },
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
  return NextResponse.json({ success: true, data: { id: ret.id, status: "posted", postedAt } });
}, { permission: { resource: "construction.return", action: "approve" } });
