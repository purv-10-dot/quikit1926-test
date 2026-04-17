import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("opsp.categories");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { validationError } from "@/lib/api/validationError";
import { createCategorySchema } from "@/lib/schemas/categorySchema";

// GET /api/categories — list all categories for tenant
export const GET = withTenantAuth(async ({ tenantId }, request) => {
  const search = request.nextUrl.searchParams.get("search") || undefined;
  const dataType = request.nextUrl.searchParams.get("dataType") || undefined;
  const { page, limit, skip, take } = parsePagination(request);

  const where: Record<string, unknown> = { tenantId };
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
export const POST = withTenantAuth(async ({ tenantId, userId }, request) => {
  const parsed = createCategorySchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed);
  const { name, dataType, currency, description } = parsed.data;

  const item = await db.categoryMaster.create({
    data: {
      tenantId,
      name: name.trim(),
      dataType,
      currency: dataType === "Currency" ? (currency || null) : null,
      description: description?.trim() || null,
      createdBy: userId,
    },
  });

  return NextResponse.json({ success: true, data: item }, { status: 201 });
}, { fallbackErrorMessage: "Failed to create category" });
