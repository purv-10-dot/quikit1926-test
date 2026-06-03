import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("store");

/**
 * Internal Return posting: stock comes BACK IN (qtyIn > 0) at the issue
 * location. No upstream balance check needed — adding to stock can't go
 * negative. transactionType = "return_internal".
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const ret = await db.cnInternalReturn.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: { lines: true },
  });
  if (!ret) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (ret.status === "posted") return NextResponse.json({ success: false, error: "Already posted" }, { status: 409 });

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
            transactionType: "return_internal",
            transactionRefId: ret.id,
            transactionRefNumber: ret.returnNumber,
            transactionDate: ret.returnDate,
            qtyIn: line.returnQty,
            qtyOut: 0,
            unitRate: line.unitRate,
            amount: line.amount,
            uomId: line.uomId,
            createdBy: userId,
          },
        });
      }
      await tx.cnInternalReturn.update({
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
