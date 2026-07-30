import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("opsp.categories", "OPSP.Categories");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { validationError } from "@/lib/api/validationError";
import { createCategorySchema } from "@/lib/schemas/categorySchema";
import { writeAuditLog } from "@/lib/api/auditLog";

// Fixed org-level channel so all category audit entries list together
// (the per-category id lives in the logged values). Kept in sync with
// app/api/categories/[id]/route.ts and app/api/categories/logs/route.ts.
const CATEGORY_AUDIT_ENTITY_ID = "category-mgmt";

// Sortable columns — allow-list keyed by the FeatureGrid column key. Anything
// off-list falls back to the manual `position` order (drag-to-reorder view).
const CATEGORY_SORT_MAP: Record<string, string> = {
  name: "name",
  dataType: "dataType",
  currency: "currency",
  categoryType: "categoryType",
  createdAt: "createdAt",
};

// GET /api/categories — list categories for the tenant. Supports search,
// dataType filter, server pagination, sort, and the Trash view (includeDeleted).
export const GET = auth.view(async ({ orgId }, request) => {
  const sp = request.nextUrl.searchParams;
  const search = sp.get("search") || undefined;
  const dataType = sp.get("dataType") || undefined;
  const includeDeleted = sp.get("includeDeleted") === "true";
  const sortBy = sp.get("sortBy") || "";
  const sortOrder = sp.get("sortOrder") === "desc" ? "desc" : "asc";
  const { page, limit, skip, take } = parsePagination(request);

  const where: Record<string, unknown> = { orgId };
  // Default view hides soft-deleted rows; the Trash view shows ONLY them.
  where.deletedAt = includeDeleted ? { not: null } : null;
  if (dataType) where.dataType = dataType;
  if (search) where.name = { contains: search, mode: "insensitive" };

  // Explicit sort when a valid column is chosen; else the manual drag order
  // (position asc, nulls last) with createdAt as a stable tiebreaker.
  const sortCol = CATEGORY_SORT_MAP[sortBy];
  const orderBy = sortCol
    ? [{ [sortCol]: sortOrder }, { id: "asc" as const }]
    : [{ position: "asc" as const }, { createdAt: "asc" as const }];

  const [items, total] = await Promise.all([
    db.categoryMaster.findMany({ where, orderBy, skip, take }),
    db.categoryMaster.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(items, total, page, limit));
}, { fallbackErrorMessage: "Failed to fetch categories" });

// POST /api/categories — create a new category
// Duplicate rule: (orgId, lowercased name, dataType, currency) must be unique.
// A P2002 from Prisma surfaces as a friendly 409.
export const POST = auth.create(async ({ orgId, userId }, request) => {
  const parsed = createCategorySchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { name, dataType, currency, description, categoryType, breakdownType } = parsed.data;

  const trimmedName = name.trim();
  const effectiveCurrency = dataType === "Currency" ? (currency || null) : null;

  try {
    const item = await db.categoryMaster.create({
      data: {
        orgId,
        name: trimmedName,
        nameKey: trimmedName.toLowerCase(),
        dataType,
        currency: effectiveCurrency,
        description: description?.trim() || null,
        categoryType: categoryType ?? "Cumulative",
        breakdownType: breakdownType ?? "Automatic",
        createdBy: userId,
      },
    });
    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "CREATE",
      entityType: "Category",
      entityId: CATEGORY_AUDIT_ENTITY_ID,
      newValues: {
        name: item.name,
        dataType: item.dataType,
        currency: item.currency,
        categoryType: item.categoryType,
        description: item.description,
      },
      changes: ["name", "dataType", "currency", "categoryType", "description"],
    });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { success: false, error: "A category with this name and unit already exists." },
        { status: 409 },
      );
    }
    throw err;
  }
}, { fallbackErrorMessage: "Failed to create category" });

// Prisma P2002 = unique constraint violation
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
