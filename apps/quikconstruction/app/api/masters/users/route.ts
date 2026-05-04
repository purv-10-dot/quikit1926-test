import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("masters");

/**
 * GET /api/masters/users — tenant members for picker components.
 * Returns only active memberships; excludes soft-deleted users.
 */
export const GET = withTenantAuth(async ({ orgId }) => {
  const memberships = await db.membership.findMany({
    where: { orgId, status: "active" },
    select: {
      role: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
    orderBy: { user: { firstName: "asc" } },
  });
  const users = memberships.map(m => ({ ...m.user, role: m.role }));
  return NextResponse.json({ success: true, data: users });
});
