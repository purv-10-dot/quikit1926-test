import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("finance");

export const GET = withOrgAuth(async ({ orgId }, _req, ctx: { params: { id: string } }) => {
  const r = await db.cnClientReceipt.findFirst({
    where: { id: ctx.params.id, orgId },
    include: {
      customer: true,
      allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, total: true, paidAmount: true, status: true } } } },
    },
  });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: r });
}, { permission: { resource: "construction.finance", action: "view" } });
