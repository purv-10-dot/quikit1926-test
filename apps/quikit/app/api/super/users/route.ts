import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";

/**
 * GET /api/super/users — list all users across all tenants (super admin only)
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if ("error" in auth) return auth.error;

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isSuperAdmin: true,
      lastSignInAt: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const data = users.map((u) => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    isSuperAdmin: u.isSuperAdmin,
    lastSignInAt: u.lastSignInAt?.toISOString() ?? null,
    membershipCount: u._count.memberships,
  }));

  return NextResponse.json({ success: true, data });
}
