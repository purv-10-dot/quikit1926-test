/**
 * /api/offerings/[id] — PUT update, DELETE soft-delete (isActive=false).
 *
 * Replaces /api/products/[id] + /api/services/[id]. The `type` field is
 * editable on PUT — uncommon but supported (e.g. user reclassifies an
 * accidentally-typed offering).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

type AnyRow = Record<string, unknown>;

function withCompatId<T extends AnyRow>(row: T): T & { _id: unknown } {
  return { ...row, _id: row.id };
}

const updateOfferingSchema = z.object({
  type: z.string().optional(),
  name: z.string().min(1),
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
// PUT /api/offerings/[id]
// ---------------------------------------------------------------------------
export const PUT = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => null);
    const parsed = updateOfferingSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const existing = await db.offering.findFirst({
      where: { id: params.id, orgId, createdBy: userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Offering not found" }, { status: 404 });
    }

    const updated = await db.offering.update({
      where: { id: params.id },
      data: {
        ...(body.type?.trim() ? { type: body.type.trim() } : {}),
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
        updatedBy: userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { offering: { ...withCompatId(updated), userId: updated.createdBy } },
    });
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/offerings/[id] — soft delete
// ---------------------------------------------------------------------------
export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const existing = await db.offering.findFirst({
      where: { id: params.id, orgId, createdBy: userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Offering not found" }, { status: 404 });
    }

    await db.offering.update({
      where: { id: params.id },
      data: { isActive: false, updatedBy: userId },
    });

    return NextResponse.json({ success: true, data: null });
  },
);
