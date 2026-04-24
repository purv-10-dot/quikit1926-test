import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("finance");

export const GET = withTenantAuth(async ({ tenantId }, _req, ctx: { params: { id: string } }) => {
  const r = await db.cnClientReceipt.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      customer: true,
      allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, total: true, paidAmount: true, status: true } } } },
    },
  });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: r });
});
