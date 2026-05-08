/**
 * /api/user/active-brand
 *
 * GET — returns the current user's active brand id.
 *       Several feature pages (calendar, content-hub, posts/create) read
 *       this on mount.
 *
 * PUT — compatibility shim for older callers that send the brandId here.
 *       New code should use PATCH /api/user/profile { activeBrandId }.
 *
 * Ported to QuikIT (Phase 3, Batch 5).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// GET /api/user/active-brand
// ---------------------------------------------------------------------------
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const pref = await db.userPreference.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { activeBrandId: true },
  });
  return NextResponse.json({
    success: true,
    data: { activeBrandId: pref?.activeBrandId ?? null },
  });
});

// ---------------------------------------------------------------------------
// PUT /api/user/active-brand { brandId }
// ---------------------------------------------------------------------------
const putBodySchema = z.object({ brandId: z.string().min(1) });

export const PUT = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = putBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "brandId is required" },
      { status: 422 },
    );
  }
  const brandId = parsed.data.brandId.trim();

  await db.userPreference.upsert({
    where: { orgId_userId: { orgId, userId } },
    update: { activeBrandId: brandId },
    create: { orgId, userId, activeBrandId: brandId },
  });

  return NextResponse.json({
    success: true,
    data: { activeBrandId: brandId },
  });
});
