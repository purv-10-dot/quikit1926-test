import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type Row = { id: string; name: string; parent_id: string | null; is_active: boolean };

/**
 * Item Category / Sub-category lookup.
 *   GET  ?parent_id=<id>   → sub-categories of a category
 *   GET  (no parent_id)    → top-level categories
 *   GET  ?all=1            → every category (with parent_id) for the form
 *   POST { name, parent_id? } → create a category (or sub-category), idempotent
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const sp = request.nextUrl.searchParams;
  const all = sp.get("all") === "1";
  const parentId = sp.get("parent_id");

  try {
    let rows: Row[];
    if (all) {
      rows = (await prisma.$queryRaw`
        SELECT id, name, parent_id, is_active FROM item_categories
        WHERE org_id = ${orgId}::uuid AND is_active = true ORDER BY name ASC
      `) as Row[];
    } else if (parentId) {
      rows = (await prisma.$queryRaw`
        SELECT id, name, parent_id, is_active FROM item_categories
        WHERE org_id = ${orgId}::uuid AND parent_id = ${parentId}::uuid AND is_active = true ORDER BY name ASC
      `) as Row[];
    } else {
      rows = (await prisma.$queryRaw`
        SELECT id, name, parent_id, is_active FROM item_categories
        WHERE org_id = ${orgId}::uuid AND parent_id IS NULL AND is_active = true ORDER BY name ASC
      `) as Row[];
    }
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "CATEGORY_LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; parent_id?: unknown };
    const name = String(body.name ?? "").trim();
    if (name.length < 1 || name.length > 120) {
      return fail(422, { code: "VALIDATION_FAILED", message: "Category name is required (1–120 chars)." });
    }
    const parentId = typeof body.parent_id === "string" && body.parent_id.trim() ? body.parent_id.trim() : null;

    // Validate parent belongs to org and is itself top-level (one level deep).
    if (parentId) {
      const parent = (await prisma.$queryRaw`
        SELECT id, parent_id FROM item_categories WHERE id = ${parentId}::uuid AND org_id = ${orgId}::uuid LIMIT 1
      `) as Array<{ id: string; parent_id: string | null }>;
      if (!parent.length) return fail(422, { code: "VALIDATION_FAILED", message: "Parent category not found." });
      if (parent[0].parent_id) return fail(422, { code: "VALIDATION_FAILED", message: "Sub-categories cannot be nested further." });
    }

    // Idempotent: reuse an existing match (case-insensitive) at the same level.
    const existing = parentId
      ? ((await prisma.$queryRaw`
          SELECT id, name, parent_id, is_active FROM item_categories
          WHERE org_id = ${orgId}::uuid AND parent_id = ${parentId}::uuid AND lower(name) = ${name.toLowerCase()} LIMIT 1
        `) as Row[])
      : ((await prisma.$queryRaw`
          SELECT id, name, parent_id, is_active FROM item_categories
          WHERE org_id = ${orgId}::uuid AND parent_id IS NULL AND lower(name) = ${name.toLowerCase()} LIMIT 1
        `) as Row[]);
    if (existing.length) return ok(existing[0], undefined, { status: 200 });

    const created = (await prisma.$queryRaw`
      INSERT INTO item_categories (org_id, name, parent_id)
      VALUES (${orgId}::uuid, ${name}, ${parentId}::uuid)
      RETURNING id, name, parent_id, is_active
    `) as Row[];
    return ok(created[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CATEGORY_CREATE_FAILED", message: errorMessage(error) });
  }
}
