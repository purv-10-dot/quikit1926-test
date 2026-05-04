import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("projects");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const boq = await db.cnBOQ.findFirst({
    where: { id: params.id, orgId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      items: {
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
        include: {
          item: { select: { id: true, code: true, name: true } },
          uom: { select: { id: true, code: true } },
        },
      },
    },
  });
  if (!boq) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: boq });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const boq = await db.cnBOQ.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!boq) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (boq.status === "locked") {
    return NextResponse.json({ success: false, error: "Locked BOQ cannot be deleted. Unlock first." }, { status: 400 });
  }
  await db.cnBOQ.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
