import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { logAudit } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("store");

/**
 * POST /api/store/grn/[id]/post
 *
 * Transitions a DRAFT GRN to POSTED. This is the only code path that writes
 * stock-in rows to `CnStockLedger`. Everything happens in one DB transaction:
 *
 *   1. Lock the GRN (draft-only)
 *   2. For each line: insert a ledger row (qtyIn = acceptedQty)
 *   3. For each line with a linked PO line: increment PO line `receivedQty`,
 *      decrement `pendingQty`
 *   4. Update PO status based on aggregate: fully_received | partially_received
 *   5. Mark GRN status=posted + set postedAt, postedBy
 *
 * If any step fails, the whole transaction rolls back. Re-posting a posted
 * GRN is a no-op (returns 409).
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const grn = await db.cnGoodsReceiptNote.findFirst({
    where: { id: params.id, orgId },
    include: {
      lines: true,
      po: { include: { lines: true } },
    },
  });
  if (!grn) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (grn.status === "posted") {
    return NextResponse.json({ success: false, error: "GRN is already posted" }, { status: 409 });
  }
  if (grn.status !== "draft") {
    return NextResponse.json(
      { success: false, error: `Cannot post from status '${grn.status}'` },
      { status: 400 },
    );
  }

  const postedAt = new Date();

  try {
    await db.$transaction(async (tx) => {
      // 1. Stock ledger rows (one per line with acceptedQty > 0)
      for (const line of grn.lines) {
        if (Number(line.acceptedQty) <= 0) continue;
        await tx.cnStockLedger.create({
          data: {
            orgId,
            projectId: grn.projectId,
            locationId: grn.locationId,
            itemId: line.itemId,
            transactionType: "grn",
            transactionRefId: grn.id,
            transactionRefNumber: grn.grnNumber,
            transactionDate: grn.grnDate,
            qtyIn: line.acceptedQty,
            qtyOut: 0,
            unitRate: line.unitRate,
            amount: line.amount,
            uomId: line.uomId,
            createdBy: userId,
          },
        });
      }

      // 2. Update PO line pending/received qtys
      for (const line of grn.lines) {
        if (!line.poLineId) continue;
        const poLine = grn.po.lines.find((x) => x.id === line.poLineId);
        if (!poLine) continue;
        const newReceived = Number(poLine.receivedQty) + Number(line.acceptedQty);
        const newPending = Math.max(0, Number(poLine.orderedQty) - newReceived);
        await tx.cnPurchaseOrderLine.update({
          where: { id: poLine.id },
          data: {
            receivedQty: newReceived,
            pendingQty: newPending,
          },
        });
      }

      // 3. Aggregate PO status after this post
      const refreshedLines = await tx.cnPurchaseOrderLine.findMany({
        where: { poId: grn.poId },
        select: { orderedQty: true, receivedQty: true },
      });
      const totalOrdered = refreshedLines.reduce((s, l) => s + Number(l.orderedQty), 0);
      const totalReceived = refreshedLines.reduce((s, l) => s + Number(l.receivedQty), 0);
      const nextStatus =
        totalReceived >= totalOrdered ? "fully_received" : totalReceived > 0 ? "partially_received" : "sent";
      await tx.cnPurchaseOrder.update({
        where: { id: grn.poId },
        data: { status: nextStatus, updatedBy: userId },
      });

      // 4. Mark GRN posted
      await tx.cnGoodsReceiptNote.update({
        where: { id: grn.id },
        data: { status: "posted", updatedBy: userId },
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Posting failed";
    return NextResponse.json({ success: false, error: `Transaction failed: ${msg}` }, { status: 500 });
  }

  await logAudit({ orgId, userId, actionType: "post", entityType: "cnGoodsReceiptNote", entityId: grn.id, entityRef: grn.grnNumber, oldValues: { status: "draft" }, newValues: { status: "posted" } });
  return NextResponse.json({ success: true, data: { id: grn.id, status: "posted", postedAt } });
}, { permission: { resource: "construction.grn", action: "approve" } });
