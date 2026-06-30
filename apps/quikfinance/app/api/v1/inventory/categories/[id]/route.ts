import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

/** Rename / activate-deactivate a category or sub-category. Body: { name?, is_active? } */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const body = (await request.json()) as { name?: unknown; is_active?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    if (name !== undefined && (name.length < 1 || name.length > 120)) {
      return fail(422, { code: "VALIDATION_FAILED", message: "Category name must be 1–120 characters." });
    }
    const isActive = typeof body.is_active === "boolean" ? body.is_active : undefined;
    if (name === undefined && isActive === undefined) return fail(422, { code: "NO_CHANGES", message: "Nothing to update." });

    const rows = (await prisma.$queryRaw`
      UPDATE item_categories SET
        name = COALESCE(${name ?? null}, name),
        is_active = COALESCE(${isActive ?? null}, is_active),
        updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid
      RETURNING id, name, parent_id, is_active`) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Category not found." });
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "CATEGORY_UPDATE_FAILED", message: errorMessage(error) });
  }
}

/** Delete a category (sub-categories cascade). Items keep their value but lose the link. */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const res = (await prisma.$executeRaw`DELETE FROM item_categories WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`) as unknown as number;
    if (Number(res) === 0) return fail(404, { code: "NOT_FOUND", message: "Category not found." });
    return ok({ deleted: true });
  } catch (error) {
    return fail(400, { code: "CATEGORY_DELETE_FAILED", message: errorMessage(error) });
  }
}
