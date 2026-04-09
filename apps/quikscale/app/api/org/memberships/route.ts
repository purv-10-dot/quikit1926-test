import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/org/memberships
 * Returns all organisations the current user belongs to (active + pending).
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
          id: true,
          name: true,
          slug: true,
          description: true,
          logoUrl: true,
          brandColor: true,
          plan: true,
          status: true,
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
    description: m.tenant.description,
    logoUrl: m.tenant.logoUrl,
    brandColor: m.tenant.brandColor,
    plan: m.tenant.plan,
    role: m.role,
    status: m.status, // "active" | "pending" etc
    invitedAt: m.invitedAt,
    acceptedAt: m.acceptedAt,
  }));

  return NextResponse.json({ success: true, data: orgs });
}
