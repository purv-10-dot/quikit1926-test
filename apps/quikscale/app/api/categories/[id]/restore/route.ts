import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

// Restore requires the same permission as delete (it undoes one).
const auth = withOrgAuthForResource("opsp.categories", "OPSP.Categories");

// Fixed org-level audit channel — keep in sync with the other category routes.
const CATEGORY_AUDIT_ENTITY_ID = "category-mgmt";

type RouteParams = { id: string };

// POST /api/categories/[id]/restore — clear the soft-delete tombstone.
export const POST = auth.delete<RouteParams>(async ({ orgId, userId }, _request, { params }) => {
  const existing = await db.categoryMaster.findFirst({ where: { id: params.id, orgId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (existing.deletedAt == null) return NextResponse.json({ success: true, message: "Already active" });

  const restored = await db.categoryMaster.update({
    where: { id: params.id },
    data: { deletedAt: null },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "Category",
    entityId: CATEGORY_AUDIT_ENTITY_ID,
    newValues: {
      name: restored.name,
      dataType: restored.dataType,
      currency: restored.currency,
      categoryType: restored.categoryType,
      description: restored.description,
    },
  });

  return NextResponse.json({ success: true, data: restored });
}, { fallbackErrorMessage: "Failed to restore category" });
