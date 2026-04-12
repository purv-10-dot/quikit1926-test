import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";

/**
 * GET /api/super/orgs — list all tenants (super admin only)
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  const tenants = await db.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      status: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    plan: t.plan,
    status: t.status,
    memberCount: t._count.memberships,
    createdAt: t.createdAt.toISOString(),
  }));

  return NextResponse.json({ success: true, data });
}
