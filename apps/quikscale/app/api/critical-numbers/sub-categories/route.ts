import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { validationError } from "@/lib/api/validationError";
import { createSubCategorySchema } from "@/lib/schemas/criticalNumberSchema";
import { validateCategoryInOrg } from "@/lib/api/criticalNumberValidation";

/**
 * Sub-categories — the second level of a Critical Number's classification.
 *
 * `SubCategory` is a NEW model introduced with Critical Numbers; nothing else
 * reads or writes it. CategoryMaster (its parent) is only ever read from here.
 *
 * Route note: this sits beside the `[id]` dynamic segment. Next.js resolves
 * static segments first, so `/api/critical-numbers/sub-categories` never falls
 * through to `[id]` — but that also means "sub-categories" is now a reserved
 * id. Ids are cuids, so the collision can't occur in practice.
 */
const auth = withOrgAuthForResource("criticalNumbers", "CriticalNumber");

const FIELDS = { id: true, categoryId: true, name: true } as const;

/**
 * GET /api/critical-numbers/sub-categories?categoryId=…
 *
 * Without `categoryId` this returns every sub-category in the org, which is
 * what the create form wants: it caches the full set once and filters client
 * side as the user switches category, instead of refetching per selection.
 */
export const GET = auth.view(async ({ orgId }, req) => {
  const categoryId = req.nextUrl.searchParams.get("categoryId") || undefined;

  const items = await db.subCategory.findMany({
    where: { orgId, ...(categoryId ? { categoryId } : {}) },
    select: FIELDS,
    orderBy: [{ name: "asc" }],
  });

  return NextResponse.json({ success: true, data: items });
});

/**
 * POST /api/critical-numbers/sub-categories
 *
 * Backs the form's inline "+ New Sub Category". Guarded by `auth.create` on
 * CriticalNumber — anyone who can create a metric can create the label it
 * files under; a separate permission for a two-field lookup row would be
 * friction without a matching risk.
 */
export const POST = auth.create(async ({ orgId }, req) => {
  const parsed = createSubCategorySchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed);
  const { categoryId, name } = parsed.data;

  // Read-only check against CategoryMaster: the parent must exist in this org
  // and not be in the trash.
  const badCategory = await validateCategoryInOrg(orgId, categoryId);
  if (badCategory) return badCategory;

  try {
    const created = await db.subCategory.create({
      data: { orgId, categoryId, name },
      select: FIELDS,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: unknown) {
    // P2002 = the (orgId, categoryId, name) unique index. Returning the
    // existing row would silently ignore a typo, so this is a hard 409.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { success: false, error: "A sub category with this name already exists in this category." },
        { status: 409 },
      );
    }
    throw err;
  }
});
