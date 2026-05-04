import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("purchase");

export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const po = await db.cnPurchaseOrder.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!po) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (po.status === "closed" || po.status === "cancelled") {
    return NextResponse.json(
      { success: false, error: `PO is already ${po.status}` },
      { status: 400 },
    );
  }
  const updated = await db.cnPurchaseOrder.update({
    where: { id: params.id },
    data: { status: "closed", updatedBy: userId },
  });
  return NextResponse.json({ success: true, data: updated });
});
