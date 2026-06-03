import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const r = await db.cnGoodReturn.findFirst({
    where: { id: params.id, orgId },
    include: { grn: { select: { id: true, grnNumber: true } }, project: true, vendor: true, location: true, lines: { include: { item: true, uom: true } } },
  });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: r });
}, { permission: { resource: "construction.return", action: "view" } });

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const r = await db.cnGoodReturn.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (r.status === "posted") return NextResponse.json({ success: false, error: "Posted returns are immutable" }, { status: 400 });
  await db.cnGoodReturn.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
}, { permission: { resource: "construction.return", action: "delete" } });
