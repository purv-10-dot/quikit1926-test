/**
 * Verticals — list / create.
 *
 *   GET  /api/verticals
 *   POST /api/verticals  body { name, description?, slug? }
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getVCRole, denyIfNotInRoles, FUND_ADMIN_ROLES } from "@/lib/rbac";

const postSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be kebab-case").optional(),
});

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

export const GET = withOrgAuth(async ({ orgId }) => {
  const items = await db.vCVertical.findMany({
    where: { orgId },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { scoringCriteria: true, deals: true } },
    },
  });
  return NextResponse.json({ success: true, data: items });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const denied = denyIfNotInRoles(await getVCRole(userId, orgId), FUND_ADMIN_ROLES);
  if (denied) return denied;

  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const slug = parsed.data.slug ?? slugify(parsed.data.name);

  const existing = await db.vCVertical.findUnique({
    where: { orgId_slug: { orgId, slug } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: "Slug already exists" },
      { status: 409 },
    );
  }

  const max = await db.vCVertical.aggregate({
    where: { orgId },
    _max: { sortOrder: true },
  });

  const created = await db.vCVertical.create({
    data: {
      orgId,
      slug,
      name: parsed.data.name,
      description: parsed.data.description,
      sortOrder: (max._max.sortOrder ?? 0) + 10,
      createdBy: userId,
      updatedBy: userId,
    },
    select: { id: true, slug: true, name: true },
  });
  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
