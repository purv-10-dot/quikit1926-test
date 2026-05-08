/**
 * /api/services/[id] — PUT update, DELETE soft-delete.
 *
 * Ported to QuikIT (Phase 3, Batch 1). Mirrors products/[id] behavior.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

type AnyRow = Record<string, unknown>;

function withCompatId<T extends AnyRow>(row: T): T & { _id: unknown } {
  return { ...row, _id: row.id };
}

const updateServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  pricing: z.string().nullish(),
  currency: z.string().nullish(),
  category: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  imageUrls: z.array(z.string()).optional(),
  duration: z.string().nullish(),
});

// ---------------------------------------------------------------------------
// PUT /api/services/[id]
// ---------------------------------------------------------------------------
export const PUT = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => null);
    const parsed = updateServiceSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const existing = await db.service.findFirst({
      where: { id: params.id, orgId, createdBy: userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 });
    }

    const updated = await db.service.update({
      where: { id: params.id },
      data: {
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        pricing: body.pricing?.trim() ?? null,
        currency: body.currency?.trim() || null,
        category: body.category?.trim() ?? null,
        tags: body.tags ?? [],
        imageUrls: body.imageUrls ?? [],
        duration: body.duration?.trim() ?? null,
        updatedBy: userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { service: { ...withCompatId(updated), userId: updated.createdBy } },
    });
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/services/[id] — soft delete
// ---------------------------------------------------------------------------
export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const existing = await db.service.findFirst({
      where: { id: params.id, orgId, createdBy: userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Service not found" }, { status: 404 });
    }

    await db.service.update({
      where: { id: params.id },
      data: { isActive: false, updatedBy: userId },
    });

    return NextResponse.json({ success: true, data: null });
  },
);
