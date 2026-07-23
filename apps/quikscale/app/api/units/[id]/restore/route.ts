import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const auth = withOrgAuthForResource("orgSetup.units", "Unit");

const UNIT_AUDIT_ENTITY_ID = "unit-mgmt";

type RouteParams = { id: string };

// POST /api/units/[id]/restore — clear the soft-delete tombstone.
export const POST = auth.delete<RouteParams>(async ({ orgId, userId }, _request, { params }) => {
  const existing = await db.unitMaster.findFirst({ where: { id: params.id, orgId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (existing.deletedAt == null) return NextResponse.json({ success: true, message: "Already active" });

  const restored = await db.unitMaster.update({
    where: { id: params.id },
    data: { deletedAt: null },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "Unit",
    entityId: UNIT_AUDIT_ENTITY_ID,
    newValues: { name: restored.name, description: restored.description },
  });

  return NextResponse.json({ success: true, data: restored });
}, { fallbackErrorMessage: "Failed to restore unit" });
