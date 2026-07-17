import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("AssetRequest");

/**
 * Lightweight Category Master list for the employee "Raise a Request" form.
 *
 * Gated on `AssetRequest:create` (which Members hold) rather than reusing
 * `/api/categories` — that endpoint requires `Category:view`, and granting
 * Members that would also expose the full Category Master management screen in
 * their sidebar. This returns only what the form needs (id, name, base-category
 * name) and nothing more. Includes `baseCategoryId` + the base name so the form
 * can render a Base Category → Category cascade (grouped client-side), mirroring
 * the Add/Edit Asset form without needing the Category:view-gated endpoints.
 */
export const GET = auth.create(async ({ orgId }) => {
  const categories = await db.astCategory.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, baseCategoryId: true, baseCategory: { select: { name: true } } },
  });
  return NextResponse.json({ success: true, data: categories });
});
