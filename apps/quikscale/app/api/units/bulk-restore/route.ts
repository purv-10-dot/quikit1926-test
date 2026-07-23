import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const auth = withOrgAuthForResource("orgSetup.units", "Unit");

const UNIT_AUDIT_ENTITY_ID = "unit-mgmt";

// POST /api/units/bulk-restore — restore many soft-deleted units.
export const POST = auth.delete(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown) => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: "No ids provided" }, { status: 400 });
  }

  const { count } = await db.unitMaster.updateMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "Unit",
    entityId: UNIT_AUDIT_ENTITY_ID,
    newValues: { count, ids },
  });

  return NextResponse.json({ success: true, data: { restored: count } });
}, { fallbackErrorMessage: "Failed to restore units" });
