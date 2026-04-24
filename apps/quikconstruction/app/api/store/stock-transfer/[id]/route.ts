import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("store");

export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const t = await db.cnStockTransfer.findFirst({
    where: { id: params.id, tenantId },
    include: { project: true, fromLocation: true, toLocation: true, lines: { include: { item: true, uom: true } } },
  });
  if (!t) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: t });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const t = await db.cnStockTransfer.findFirst({ where: { id: params.id, tenantId, deletedAt: null }, select: { id: true, status: true } });
  if (!t) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (t.status === "received") return NextResponse.json({ success: false, error: "Fully-posted transfer is immutable" }, { status: 400 });
  await db.cnStockTransfer.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
