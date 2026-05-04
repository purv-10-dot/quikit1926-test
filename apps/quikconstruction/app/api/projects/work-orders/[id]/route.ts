import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("projects");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const wo = await db.cnWorkOrder.findFirst({
    where: { id: params.id, orgId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      contractor: { select: { id: true, name: true, code: true } },
      workCategory: { select: { id: true, name: true } },
      lines: { include: { item: { select: { code: true, name: true } }, uom: { select: { code: true } } } },
    },
  });
  if (!wo) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: wo });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const wo = await db.cnWorkOrder.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!wo) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (wo.status !== "draft") return NextResponse.json({ success: false, error: "Only draft WOs can be deleted" }, { status: 400 });
  await db.cnWorkOrder.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
