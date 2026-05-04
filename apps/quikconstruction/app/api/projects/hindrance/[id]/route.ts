import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("projects");

export const GET = withTenantAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const h = await db.cnHindrance.findFirst({
    where: { id: params.id, orgId },
    include: { project: { select: { id: true, name: true, code: true } } },
  });
  if (!h) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: h });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const h = await db.cnHindrance.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true } });
  if (!h) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await db.cnHindrance.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
