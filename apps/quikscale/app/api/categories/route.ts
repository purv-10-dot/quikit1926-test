import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("opsp.categories");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { validationError } from "@/lib/api/validationError";
import { createCategorySchema } from "@/lib/schemas/categorySchema";

// GET /api/categories — list all categories for tenant
export const GET = withOrgAuth(async ({ orgId }, request) => {
  const search = request.nextUrl.searchParams.get("search") || undefined;
  const dataType = request.nextUrl.searchParams.get("dataType") || undefined;
  const { page, limit, skip, take } = parsePagination(request);

  const where: Record<string, unknown> = { orgId };
  if (dataType) where.dataType = dataType;
  if (search) where.name = { contains: search, mode: "insensitive" };

  const [items, total] = await Promise.all([
    db.categoryMaster.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip,
      take,
    }),
    db.categoryMaster.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(items, total, page, limit));
}, { fallbackErrorMessage: "Failed to fetch categories" });

// POST /api/categories — create a new category
// Duplicate rule: (orgId, lowercased name, dataType, currency) must be unique.
// A P2002 from Prisma surfaces as a friendly 409.
export const POST = withOrgAuth(async ({ orgId, userId }, request) => {
  const parsed = createCategorySchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { name, dataType, currency, description, breakdownType } = parsed.data;

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
        breakdownType: breakdownType ?? "Cumulative",
        createdBy: userId,
      },
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
