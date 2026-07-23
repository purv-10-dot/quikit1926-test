import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const auth = withOrgAuthForResource("opsp.categories", "OPSP.Categories");

const CATEGORY_AUDIT_ENTITY_ID = "category-mgmt";

// POST /api/categories/bulk-restore — restore many soft-deleted categories.
export const POST = auth.delete(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown) => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ success: false, error: "No ids provided" }, { status: 400 });
  }

  const { count } = await db.categoryMaster.updateMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "Category",
    entityId: CATEGORY_AUDIT_ENTITY_ID,
    newValues: { count, ids },
  });

  return NextResponse.json({ success: true, data: { restored: count } });
}, { fallbackErrorMessage: "Failed to restore categories" });
