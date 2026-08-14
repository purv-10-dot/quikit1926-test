import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

/**
 * Read-only lookup data for the Critical Numbers create form.
 *
 * Why this exists rather than calling the existing endpoints: `/api/categories`
 * is gated on the `opsp.categories` module and `/api/units` on
 * `orgSetup.units`. A user who has Critical Numbers but not OPSP or Org Setup
 * would get a 403 and an empty dropdown. This serves the same rows behind the
 * `criticalNumbers` gate instead.
 *
 * It only ever READS `CategoryMaster` and `UnitMaster` — no writes, and no
 * change to either owning module.
 */
const auth = withOrgAuthForResource("criticalNumbers", "CriticalNumber");

/**
 * GET /api/critical-numbers/options
 *
 * One round-trip for the whole form. Sub-categories come back unfiltered so the
 * form can narrow them client-side as the category changes.
 */
export const GET = auth.view(async ({ orgId }) => {
  const [categories, subCategories, units] = await Promise.all([
    db.categoryMaster.findMany({
      // Trashed categories stay selectable nowhere — matches the server-side
      // `validateCategoryInOrg` check, so the form can't offer what POST rejects.
      where: { orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    db.subCategory.findMany({
      where: { orgId },
      select: { id: true, categoryId: true, name: true },
      orderBy: [{ name: "asc" }],
    }),
    db.unitMaster.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
  ]);

  return NextResponse.json({ success: true, data: { categories, subCategories, units } });
}, { fallbackErrorMessage: "Failed to load form options" });
