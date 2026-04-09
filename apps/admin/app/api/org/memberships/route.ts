import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_HIERARCHY } from "@/lib/constants";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY["admin"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await db.membership.findMany({
    where: { userId: session.user.id, status: "active" },
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

  // Only show orgs where user has admin-level access
  const adminOrgs = memberships
    .filter((m) => {
      const level = ROLE_HIERARCHY[m.role as keyof typeof ROLE_HIERARCHY] ?? 0;
      return level >= ADMIN_MIN_LEVEL;
    })
    .map((m) => ({
      membershipId: m.id,
      tenantId: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      description: m.tenant.description,
      logoUrl: m.tenant.logoUrl,
      brandColor: m.tenant.brandColor,
      plan: m.tenant.plan,
      role: m.role,
      status: m.status,
    }));

  return NextResponse.json({ success: true, data: adminOrgs });
}
