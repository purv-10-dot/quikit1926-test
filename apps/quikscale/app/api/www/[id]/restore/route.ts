import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withTenantAuth = withTenantAuthForModule("www");

export const POST = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });
  }

  const existing = await db.wWWItem.findFirst({ where: { id, tenantId } });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (existing.deletedAt == null) {
    return NextResponse.json({ success: true, message: "Already active" });
  }

  const restored = await db.wWWItem.update({
    where: { id },
    data: { deletedAt: null },
    select: { id: true, what: true, deletedAt: true },
  });

  await writeAuditLog({
    tenantId,
    actorId: userId,
    action: "RESTORE",
    entityType: "WWWItem",
    entityId: id,
    newValues: restored,
  });

  return NextResponse.json({ success: true, data: restored });
});
