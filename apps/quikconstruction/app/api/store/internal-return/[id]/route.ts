import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("store");

export const GET = withTenantAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const r = await db.cnInternalReturn.findFirst({
    where: { id: params.id, orgId },
    include: { issue: true, project: true, location: true, lines: { include: { item: true, uom: true } } },
  });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: r });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const r = await db.cnInternalReturn.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (r.status === "posted") return NextResponse.json({ success: false, error: "Posted returns are immutable" }, { status: 400 });
  await db.cnInternalReturn.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
