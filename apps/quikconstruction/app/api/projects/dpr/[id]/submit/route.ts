import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("projects");

export const POST = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const dpr = await db.cnDPR.findFirst({ where: { id: params.id, tenantId, deletedAt: null }, select: { id: true, status: true } });
  if (!dpr) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (dpr.status === "submitted") return NextResponse.json({ success: false, error: "Already submitted" }, { status: 409 });
  const updated = await db.cnDPR.update({
    where: { id: dpr.id },
    data: { status: "submitted", updatedBy: userId },
  });
  return NextResponse.json({ success: true, data: updated });
});
