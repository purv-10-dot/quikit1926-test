import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("hrms");

export const GET = withTenantAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const p = await db.cnPayroll.findFirst({
    where: { id: params.id, orgId },
    include: { lines: { include: { employee: { select: { id: true, empCode: true, firstName: true, lastName: true, empType: true } } } } },
  });
  if (!p) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: p });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const p = await db.cnPayroll.findFirst({ where: { id: params.id, orgId }, select: { id: true, status: true } });
  if (!p) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (p.status !== "draft") return NextResponse.json({ success: false, error: "Only draft payrolls can be deleted" }, { status: 400 });
  await db.cnPayroll.update({ where: { id: p.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
