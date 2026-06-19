import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { postLedgerEntry, LEDGER_TX_TYPES, StockError } from "@/lib/stock/ledger-service";
import type { TenantContext } from "@/lib/auth/context";

const withOrgAuth = withOrgAuthForModule("store");

/**
 * POST /api/store/stock-transfer/[id]/post
 *
 * Posts BOTH legs of the transfer atomically through the stock ledger service:
 *   - transfer_out at the source     (qtyOut)
 *   - transfer_in  at the destination (qtyIn)
 *
 * Each line moves at the SOURCE's current moving-average rate, so total
 * inventory value is conserved across the transfer (the destination's avgRate
 * isn't diluted). `postLedgerEntry` appends each CnStockLedger row AND keeps
 * the CnStockBalance cache in sync — the source-balance guard lives in the
 * service, so a transfer that would drive the source negative rolls back both
 * legs and the status flip. This route must never write the ledger directly.
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const tr = await db.cnStockTransfer.findFirst({
    where: { id: params.id, orgId },
    include: { lines: true },
  });
  if (!tr) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (tr.status === "received") return NextResponse.json({ success: false, error: "Already posted" }, { status: 409 });
  if (!tr.fromProjectId || !tr.fromLocationId || !tr.toProjectId || !tr.toLocationId) {
    return NextResponse.json({ success: false, error: "Transfer missing from/to project or location; cannot post" }, { status: 400 });
  }
  const fromProjectId = tr.fromProjectId;
  const fromLocationId = tr.fromLocationId;
  const toProjectId = tr.toProjectId;
  const toLocationId = tr.toLocationId;

  // The stock service takes a TenantContext but only reads orgId/userId.
  const ctx = { orgId, userId } as TenantContext;
  const postedAt = new Date();

  try {
    await db.$transaction(async (tx) => {
      for (const line of tr.lines) {
        const qty = Number(line.sentQty);
        if (qty <= 0) continue;

        // Move at the source location's current moving-average cost so the
        // destination's avgRate stays meaningful (not diluted to 0).
        const bal = await tx.cnStockBalance.findUnique({
          where: {
            projectId_locationId_itemId: {
              projectId: fromProjectId,
              locationId: fromLocationId,
              itemId: line.itemId,
            },
          },
        });
        const unitRate = bal ? Number(bal.avgRate.toString()) : 0;

        // OUT at source — guard rejects if it would go negative.
        await postLedgerEntry(tx, ctx, {
          projectId: fromProjectId,
          locationId: fromLocationId,
          itemId: line.itemId,
          uomId: line.uomId,
          qty,
          unitRate,
          txType: LEDGER_TX_TYPES.TRANSFER_OUT,
          refId: tr.id,
          refNumber: tr.transferNumber,
          txDate: tr.transferDate,
        });
        // IN at destination — same refId pairs the legs; same rate conserves value.
        await postLedgerEntry(tx, ctx, {
          projectId: toProjectId,
          locationId: toLocationId,
          itemId: line.itemId,
          uomId: line.uomId,
          qty,
          unitRate,
          txType: LEDGER_TX_TYPES.TRANSFER_IN,
          refId: tr.id,
          refNumber: tr.transferNumber,
          txDate: tr.transferDate,
        });
      }
      await tx.cnStockTransfer.update({
        where: { id: tr.id },
        data: { status: "received", receivedAt: postedAt, updatedBy: userId },
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
  return NextResponse.json({ success: true, data: { id: tr.id, status: "received", receivedAt: postedAt } });
}, { permission: { resource: "construction.transfer", action: "approve" } });
