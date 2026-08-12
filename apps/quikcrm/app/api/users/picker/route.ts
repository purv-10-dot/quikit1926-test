/**
 * GET /api/users/picker
 *
 * Active org members who are QuikCRM users — the owner/assignee/salesperson
 * source list for every picker in the app (Settings → Activity Targets, owner
 * dropdowns on leads/accounts/contacts/opportunities, dashboard agent filter).
 *
 * Org membership alone is NOT enough: an org can contain members who only use
 * other QuikIT modules. Those users can never own a CRM record or log an
 * activity, so they must not appear here. See lib/services/settings/crm-app-users.ts.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getCrmAppUserIds, filterToCrmAppUsers } from "@/lib/services/settings/crm-app-users";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const [memberships, crmUserIds] = await Promise.all([
      prisma.orgMember.findMany({
        where: { orgId: user.orgId, status: "active" },
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      getCrmAppUserIds(user.orgId),
    ]);

    const items = filterToCrmAppUsers(memberships, crmUserIds).map((m) => ({
      id: m.user.id,
      name: `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email,
      email: m.user.email,
      role: m.role,
    }));
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}
