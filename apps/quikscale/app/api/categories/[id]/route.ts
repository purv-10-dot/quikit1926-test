import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { updateCategorySchema } from "@/lib/schemas/categorySchema";

type RouteParams = { id: string };

// PUT /api/categories/[id] — update a category
export const PUT = withTenantAuth<RouteParams>(async ({ tenantId }, request, { params }) => {
  const existing = await db.categoryMaster.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const parsed = updateCategorySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, dataType, currency, description } = parsed.data;

  const item = await db.categoryMaster.update({
    where: { id: params.id },
    data: {
      name: name?.trim(),
      dataType,
      currency: dataType === "Currency" ? (currency || null) : null,
      description: description?.trim() || null,
    },
  });

  return NextResponse.json({ success: true, data: item });
}, { fallbackErrorMessage: "Failed to update category" });

// DELETE /api/categories/[id] — delete a category
export const DELETE = withTenantAuth<RouteParams>(async ({ tenantId }, _request, { params }) => {
  const existing = await db.categoryMaster.findFirst({ where: { id: params.id, tenantId } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.categoryMaster.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}, { fallbackErrorMessage: "Failed to delete category" });
