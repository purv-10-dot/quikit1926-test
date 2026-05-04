import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("projects");

export const POST = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const wo = await db.cnWorkOrder.findFirst({ where: { id: params.id, orgId, deletedAt: null }, select: { id: true, status: true } });
  if (!wo) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (wo.status !== "draft") return NextResponse.json({ success: false, error: `Cannot send from '${wo.status}'` }, { status: 400 });
  const updated = await db.cnWorkOrder.update({
    where: { id: wo.id },
    data: { status: "sent", updatedBy: userId },
  });
  return NextResponse.json({ success: true, data: updated });
});
