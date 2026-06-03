import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("store");

/**
 * POST /api/store/good-return/[id]/post
 *
 * Transactional: writes NEGATIVE stock rows (transactionType = "return_vendor")
 * so qtyOut decrements the ledger balance for that item at that location.
 * Pre-checks current balance >= returnQty to prevent negative stock after post.
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const ret = await db.cnGoodReturn.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: { lines: true },
  });
  if (!ret) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (ret.status === "posted") return NextResponse.json({ success: false, error: "Already posted" }, { status: 409 });

  // Balance pre-check (per item at return location)
  const insufficient: Array<{ itemId: string; available: number; requested: number }> = [];
  for (const line of ret.lines) {
    const agg = await db.cnStockLedger.aggregate({
      where: { orgId, projectId: ret.projectId, locationId: ret.locationId, itemId: line.itemId },
      _sum: { qtyIn: true, qtyOut: true },
    });
    const available = Number(agg._sum.qtyIn ?? 0) - Number(agg._sum.qtyOut ?? 0);
    if (available < Number(line.returnQty)) {
      insufficient.push({ itemId: line.itemId, available, requested: Number(line.returnQty) });
    }
  }
  if (insufficient.length) {
    return NextResponse.json({ success: false, error: "Insufficient stock for return", details: insufficient }, { status: 400 });
  }

  const postedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      for (const line of ret.lines) {
        await tx.cnStockLedger.create({
          data: {
            orgId,
            projectId: ret.projectId,
            locationId: ret.locationId,
            itemId: line.itemId,
            transactionType: "return_vendor",
            transactionRefId: ret.id,
            transactionRefNumber: ret.returnNumber,
            transactionDate: ret.returnDate,
            qtyIn: 0,
            qtyOut: line.returnQty,
            unitRate: line.unitRate,
            amount: line.amount,
            uomId: line.uomId,
            createdBy: userId,
          },
        });
      }
      await tx.cnGoodReturn.update({
        where: { id: ret.id },
        data: { status: "posted", postedAt, postedBy: userId, updatedBy: userId },
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Posting failed";
    return NextResponse.json({ success: false, error: `Transaction failed: ${msg}` }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: { id: ret.id, status: "posted", postedAt } });
}, { permission: { resource: "construction.return", action: "approve" } });
