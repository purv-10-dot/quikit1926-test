import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("opsp.categories", "OPSP.Categories");
import { validationError } from "@/lib/api/validationError";
import { updateCategorySchema } from "@/lib/schemas/categorySchema";

type RouteParams = { id: string };

// PUT /api/categories/[id] — update a category
// Enforces the same (orgId, nameKey, dataType, currency) uniqueness as create.
export const PUT = auth.update<RouteParams>(async ({ orgId }, request, { params }) => {
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

// DELETE /api/categories/[id] — delete a category
export const DELETE = auth.delete<RouteParams>(async ({ orgId }, _request, { params }) => {
  const existing = await db.categoryMaster.findFirst({ where: { id: params.id, orgId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.categoryMaster.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to delete category" });
