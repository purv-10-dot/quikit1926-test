import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const r = await db.cnGatePass.findFirst({ where: { id: params.id, orgId }, include: { project: true, location: true } });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: r });
}, { permission: { resource: "construction.gatepass", action: "view" } });

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const r = await db.cnGatePass.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true } });
  if (!r) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await db.cnGatePass.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
}, { permission: { resource: "construction.gatepass", action: "delete" } });
