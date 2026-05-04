import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("finance");

export const GET = withOrgAuth(async ({ orgId }, _req, ctx: { params: { id: string } }) => {
  const p = await db.cnVendorPayment.findFirst({
    where: { id: ctx.params.id, orgId },
    include: {
      vendor: true,
      allocations: { include: { bill: { select: { id: true, billNumber: true, total: true, paidAmount: true, status: true } } } },
    },
  });
  if (!p) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: p });
});
