import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("opsp.categories", "OPSP.Categories");
import { validationError } from "@/lib/api/validationError";
import { updateCategorySchema } from "@/lib/schemas/categorySchema";
import { writeAuditLog } from "@/lib/api/auditLog";

type RouteParams = { id: string };

// Fixed org-level channel — keep in sync with app/api/categories/route.ts.
const CATEGORY_AUDIT_ENTITY_ID = "category-mgmt";
const auditFields = (c: Record<string, unknown>) => ({
  name: c.name,
  dataType: c.dataType,
  currency: c.currency,
  categoryType: c.categoryType,
  description: c.description,
});

// PUT /api/categories/[id] — update a category
// Enforces the same (orgId, nameKey, dataType, currency) uniqueness as create.
export const PUT = auth.update<RouteParams>(async ({ orgId, userId }, request, { params }) => {
  const existing = await db.categoryMaster.findFirst({ where: { id: params.id, orgId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const parsed = updateCategorySchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { name, dataType, currency, description, categoryType, breakdownType } = parsed.data;

  const trimmedName = name?.trim();

  try {
    const item = await db.categoryMaster.update({
      where: { id: params.id },
      data: {
        name: trimmedName,
        nameKey: trimmedName !== undefined ? trimmedName.toLowerCase() : undefined,
        dataType,
        currency: dataType === "Currency" ? (currency || null) : null,
        description: description?.trim() || null,
        categoryType,
        breakdownType,
      },
    });
    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Category",
      entityId: CATEGORY_AUDIT_ENTITY_ID,
      oldValues: auditFields(existing),
      newValues: auditFields(item),
    });
    return NextResponse.json({ success: true, data: item });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "A category with this name and unit already exists." },
        { status: 409 },
      );
    }
    throw err;
  }
}, { fallbackErrorMessage: "Failed to update category" });

// DELETE /api/categories/[id] — SOFT delete (moves the category to Trash). The
// row is retained with a `deletedAt` tombstone so it can be restored; the list
// endpoint hides it by default and surfaces it under the Trash view. Mirrors the
// KPI/Priority/WWW soft-delete convention.
export const DELETE = auth.delete<RouteParams>(async ({ orgId, userId }, _request, { params }) => {
  const existing = await db.categoryMaster.findFirst({ where: { id: params.id, orgId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (existing.deletedAt != null) return NextResponse.json({ success: true, message: "Already deleted" });

  await db.categoryMaster.update({ where: { id: params.id }, data: { deletedAt: new Date() } });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "DELETE",
    entityType: "Category",
    entityId: CATEGORY_AUDIT_ENTITY_ID,
    oldValues: auditFields(existing),
  });

  return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to delete category" });
