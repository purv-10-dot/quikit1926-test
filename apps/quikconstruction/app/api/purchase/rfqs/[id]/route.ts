import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("purchase");

export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const r = await db.cnRFQ.findFirst({
    where: { id: params.id, tenantId },
    include: {
      project: true,
      lines: { include: { item: true, uom: true } },
      vendors: { include: { vendor: true } },
    },
  });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: r });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const r = await db.cnRFQ.findFirst({ where: { id: params.id, tenantId, deletedAt: null }, select: { id: true, status: true } });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (r.status === "awarded") return NextResponse.json({ success: false, error: "Awarded RFQs cannot be deleted" }, { status: 400 });
  await db.cnRFQ.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
