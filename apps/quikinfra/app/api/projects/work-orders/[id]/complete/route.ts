import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("projects");

export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const wo = await db.cnWorkOrder.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!wo) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (wo.status === "completed" || wo.status === "closed") {
    return NextResponse.json({ success: false, error: `Already ${wo.status}` }, { status: 409 });
  }
  const updated = await db.cnWorkOrder.update({
    where: { id: wo.id },
    data: { status: "completed", completedAt: new Date(), completedBy: userId, updatedBy: userId },
  });
  return NextResponse.json({ success: true, data: updated });
}, { permission: { resource: "construction.wo", action: "edit" } });
