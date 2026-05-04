import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const r = await db.cnDieselLog.findFirst({
    where: { id: params.id, orgId },
    include: { project: true, location: true, machinery: true },
  });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: r });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const r = await db.cnDieselLog.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true } });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await db.cnDieselLog.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
