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
 * name) and nothing more.
 */
export const GET = auth.create(async ({ orgId }) => {
  const categories = await db.astCategory.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, baseCategory: { select: { name: true } } },
  });
  return NextResponse.json({ success: true, data: categories });
});
