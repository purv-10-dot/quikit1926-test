import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/org/memberships
 * Returns all organisations the current user belongs to.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await db.membership.findMany({
    where: { userId: session.user.id },
    include: {
      tenant: {
        select: {
          id: true, name: true, slug: true, description: true,
          logoUrl: true, brandColor: true, plan: true, status: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const orgs = memberships.map((m) => ({
    membershipId: m.id,
    tenantId: m.tenant.id,
    name: m.tenant.name,
    slug: m.tenant.slug,
    plan: m.tenant.plan,
    role: m.role,
    status: m.status,
  }));

  return NextResponse.json(
    { success: true, data: orgs },
    {
      // Per-user membership list. Short browser cache keeps the select-org
      // UI snappy without going stale on role / org changes.
      // See docs/plans/P1-2-cache-control-headers.md.
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    },
  );
}
