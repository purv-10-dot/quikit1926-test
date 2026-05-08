/**
 * /api/products — GET list (paginated), POST create.
 *
 * Ported to QuikIT (Phase 3, Batch 1). Catalog page is a 3×5 grid (15
 * per page); limit is capped at 100. _id alias preserved.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

type AnyRow = Record<string, unknown>;

function withCompatId<T extends AnyRow>(row: T): T & { _id: unknown } {
  return { ...row, _id: row.id };
}

const createProductSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().nullish(),
  price: z.string().nullish(),
  currency: z.string().nullish(),
  category: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  imageUrls: z.array(z.string()).optional(),
  sku: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// GET /api/products?brandId=X&page=1&limit=15
// ---------------------------------------------------------------------------
export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ success: false, error: "brandId is required" }, { status: 400 });
  }

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "15", 10) || 15),
  );
  const skip = (page - 1) * limit;

  const where = { orgId, brandId, isActive: true };
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    db.product.count({ where }),
  ]);

  const products = rows.map((p) => ({ ...withCompatId(p), userId: p.createdBy }));

  return NextResponse.json({
    success: true,
    data: {
      products,
      pagination: {
        page,
        pageSize: limit,
        total,
        hasMore: skip + products.length < total,
      },
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/products
// ---------------------------------------------------------------------------
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = createProductSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const created = await db.product.create({
    data: {
      orgId,
      brandId: body.brandId,
      createdBy: userId,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      price: body.price?.trim() ?? null,
      currency: body.currency?.trim() || null,
      category: body.category?.trim() ?? null,
      tags: body.tags ?? [],
      imageUrls: body.imageUrls ?? [],
      sku: body.sku?.trim() ?? null,
    },
  });

  return NextResponse.json(
    { success: true, data: { product: { ...withCompatId(created), userId: created.createdBy } } },
    { status: 201 },
  );
});
