import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withTenantAuth = withTenantAuthForModule("kpi");

// POST /api/kpi/bulk-restore  body: { ids: string[] }
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: "No ids provided" }, { status: 400 });
  }

  const { count } = await db.kPI.updateMany({
    where: { id: { in: ids }, tenantId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });

  await writeAuditLog({
    tenantId, actorId: userId, action: "RESTORE",
    entityType: "KPI", entityId: ids.join(","), newValues: { count, ids },
  });

  return NextResponse.json({ success: true, data: { restored: count } });
});
