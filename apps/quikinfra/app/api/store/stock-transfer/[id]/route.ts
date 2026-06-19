import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const t = await db.cnStockTransfer.findFirst({
    where: { id: params.id, orgId },
    include: { fromProject: true, fromLocation: true, toLocation: true, lines: { include: { item: true, uom: true } } },
  });
  if (!t) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: t });
}, { permission: { resource: "construction.transfer", action: "view" } });

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const t = await db.cnStockTransfer.findFirst({ where: { id: params.id, orgId }, select: { id: true, status: true } });
  if (!t) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (t.status === "received") return NextResponse.json({ success: false, error: "Fully-posted transfer is immutable" }, { status: 400 });
  await db.cnStockTransfer.update({ where: { id: params.id }, data: { status: "cancelled", updatedBy: userId } });
  return NextResponse.json({ success: true });
}, { permission: { resource: "construction.transfer", action: "delete" } });
