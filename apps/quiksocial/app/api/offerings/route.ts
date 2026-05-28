/**
 * /api/offerings — GET list (paginated, filterable by type), POST create.
 *
 * Unified replacement for the old /api/products + /api/services pair.
 * The Catalog page is a single grid; the optional ?type=X filter scopes
 * to one entity type (product, service, menu_item, project, course, ...).
 *
 * Ported to QuikIT (Phase 3 batch 2). _id alias preserved for legacy
 * frontend code that still reads `offering._id`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

type AnyRow = Record<string, unknown>;

function withCompatId<T extends AnyRow>(row: T): T & { _id: unknown } {
  return { ...row, _id: row.id };
}

const createOfferingSchema = z.object({
  brandId: z.string().min(1),
  type: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().nullish(),
  price: z.string().nullish(),
  currency: z.string().nullish(),
  category: z.string().nullish(),
  duration: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  imageUrls: z.array(z.string()).optional(),
  sku: z.string().nullish(),
  url: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// GET /api/offerings?brandId=X&type=product&page=1&limit=15
// ---------------------------------------------------------------------------
export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ success: false, error: "brandId is required" }, { status: 400 });
  }

  const type = searchParams.get("type");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "15", 10) || 15),
  );
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    orgId,
    brandId,
    isActive: true,
    ...(type ? { type } : {}),
  };
  const [rows, total] = await Promise.all([
    db.offering.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    db.offering.count({ where }),
  ]);

  const offerings = rows.map((o) => ({ ...withCompatId(o), userId: o.createdBy }));

  return NextResponse.json({
    success: true,
    data: {
      offerings,
      pagination: {
        page,
        pageSize: limit,
        total,
        hasMore: skip + offerings.length < total,
      },
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/offerings
// ---------------------------------------------------------------------------
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = createOfferingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const created = await db.offering.create({
    data: {
      orgId,
      brandId: body.brandId,
      createdBy: userId,
      type: body.type?.trim() || "product",
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      price: body.price?.trim() ?? null,
      currency: body.currency?.trim() || null,
      category: body.category?.trim() ?? null,
      duration: body.duration?.trim() ?? null,
      url: body.url?.trim() ?? null,
      tags: body.tags ?? [],
      imageUrls: body.imageUrls ?? [],
      sku: body.sku?.trim() ?? null,
    },
  });

  return NextResponse.json(
    { success: true, data: { offering: { ...withCompatId(created), userId: created.createdBy } } },
    { status: 201 },
  );
});
