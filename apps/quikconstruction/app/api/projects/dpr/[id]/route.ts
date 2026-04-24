import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("projects");

export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const dpr = await db.cnDPR.findFirst({
    where: { id: params.id, tenantId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      location: { select: { id: true, name: true, code: true } },
      lines: { include: { uom: { select: { code: true } }, boqItem: { select: { id: true, description: true, code: true } } } },
      materials: { include: { item: { select: { id: true, code: true, name: true } }, uom: { select: { code: true } } } },
    },
  });
  if (!dpr) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: dpr });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const dpr = await db.cnDPR.findFirst({ where: { id: params.id, tenantId, deletedAt: null }, select: { id: true, status: true } });
  if (!dpr) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (dpr.status === "posted") {
    return NextResponse.json({ success: false, error: "Posted DPR is immutable" }, { status: 400 });
  }
  await db.cnDPR.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
