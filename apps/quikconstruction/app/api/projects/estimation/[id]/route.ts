import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("projects");

export const GET = withTenantAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const est = await db.cnEstimation.findFirst({
    where: { id: params.id, orgId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      convertedBoq: { select: { id: true, boqNumber: true } },
      items: {
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
        include: { item: { select: { code: true, name: true } }, uom: { select: { code: true } } },
      },
    },
  });
  if (!est) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: est });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const e = await db.cnEstimation.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!e) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (e.status === "converted") return NextResponse.json({ success: false, error: "Cannot delete a converted estimation" }, { status: 400 });
  await db.cnEstimation.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
