import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("projects");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const h = await db.cnHindrance.findFirst({
    where: { id: params.id, orgId },
    include: { project: { select: { id: true, name: true, code: true } } },
  });
  if (!h) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: h });
}, { permission: { resource: "construction.hindrance", action: "view" } });

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const h = await db.cnHindrance.findFirst({ where: { id: params.id, orgId }, select: { id: true } });
  if (!h) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await db.cnHindrance.update({ where: { id: params.id }, data: { status: "cancelled", updatedBy: userId } });
  return NextResponse.json({ success: true });
}, { permission: { resource: "construction.hindrance", action: "delete" } });
