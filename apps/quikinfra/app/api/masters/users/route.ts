import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("masters");

/**
 * GET /api/masters/users — tenant members for picker components.
 * Returns only active memberships; excludes soft-deleted users.
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  // Gated by construction.masters.view via withOrgAuth's permission option below.
  const memberships = await db.orgMember.findMany({
    where: { orgId, status: "active" },
    select: {
      role: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
    orderBy: { user: { firstName: "asc" } },
  });
  const users = memberships.map(m => ({ ...m.user, role: m.role }));
  return NextResponse.json({ success: true, data: users });
}, { permission: { resource: "construction.masters", action: "view" } });
