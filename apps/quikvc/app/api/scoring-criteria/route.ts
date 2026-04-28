/**
 * Scoring criteria — list / create per vertical.
 *
 *   GET  /api/scoring-criteria?verticalId=xxx
 *   POST /api/scoring-criteria  body { verticalId, name, weight, description?, slug? }
 *
 * Weight validation (sum to 100) is enforced on the bulk-save endpoint
 * (PUT /api/scoring-criteria/bulk) to avoid blocking individual edits.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { getVCRole, denyIfNotInRoles, FUND_ADMIN_ROLES } from "@/lib/rbac";

const postSchema = z.object({
  verticalId: z.string().min(1),
  name: z.string().min(2).max(120),
  weight: z.number().int().min(0).max(100),
  description: z.string().max(1000).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
});

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

export const GET = withTenantAuth(async ({ tenantId }, req: NextRequest) => {
  const verticalId = req.nextUrl.searchParams.get("verticalId");
  const where: Record<string, string> = { tenantId };
  if (verticalId) where.verticalId = verticalId;

  const items = await db.vCScoringCriterion.findMany({
    where,
    orderBy: [{ verticalId: "asc" }, { sortOrder: "asc" }],
  });
  return NextResponse.json({ success: true, data: items });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req: NextRequest) => {
  const denied = denyIfNotInRoles(await getVCRole(userId, tenantId), FUND_ADMIN_ROLES);
  if (denied) return denied;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const vertical = await db.vCVertical.findFirst({
    where: { id: parsed.data.verticalId, tenantId },
    select: { id: true },
  });
  if (!vertical) {
    return NextResponse.json({ success: false, error: "Vertical not found" }, { status: 404 });
  }

  const slug = parsed.data.slug ?? slugify(parsed.data.name);

  const existing = await db.vCScoringCriterion.findUnique({
    where: {
      tenantId_verticalId_slug: { tenantId, verticalId: vertical.id, slug },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ success: false, error: "Slug already exists in this vertical" }, { status: 409 });
  }

  const max = await db.vCScoringCriterion.aggregate({
    where: { tenantId, verticalId: vertical.id },
    _max: { sortOrder: true },
  });

  const created = await db.vCScoringCriterion.create({
    data: {
      tenantId,
      verticalId: vertical.id,
      slug,
      name: parsed.data.name,
      description: parsed.data.description,
      weight: parsed.data.weight,
      sortOrder: (max._max.sortOrder ?? 0) + 10,
      createdBy: userId,
      updatedBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
