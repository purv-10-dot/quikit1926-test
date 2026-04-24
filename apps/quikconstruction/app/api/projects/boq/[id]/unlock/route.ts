import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("projects");

export const POST = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const boq = await db.cnBOQ.findFirst({ where: { id: params.id, tenantId, deletedAt: null }, select: { id: true, status: true } });
  if (!boq) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (boq.status !== "locked") return NextResponse.json({ success: false, error: "Not locked" }, { status: 400 });
  const updated = await db.cnBOQ.update({
    where: { id: boq.id },
    data: { status: "draft", lockedAt: null, lockedBy: null, updatedBy: userId },
  });
  return NextResponse.json({ success: true, data: updated });
});
