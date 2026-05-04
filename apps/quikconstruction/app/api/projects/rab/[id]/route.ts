import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("projects");

export const GET = withTenantAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const rab = await db.cnRAB.findFirst({
    where: { id: params.id, orgId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      boq: { select: { id: true, boqNumber: true } },
      lines: { include: { boqItem: { select: { code: true, description: true, quantity: true, uom: { select: { code: true } } } } } },
    },
  });
  if (!rab) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: rab });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const rab = await db.cnRAB.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!rab) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (rab.status === "approved" || rab.status === "paid") {
    return NextResponse.json({ success: false, error: "Cannot delete an approved/paid RAB" }, { status: 400 });
  }
  await db.cnRAB.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
