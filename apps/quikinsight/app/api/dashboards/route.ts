import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/withAuth";
import { canViewAllTeams, getTeamFilter } from "@/lib/rbac";

// GET /api/dashboards — team-scoped list of dashboards.
//   • view-all roles (SUPER_ADMIN / MANAGEMENT) → every dashboard
//   • assigned users                            → only their team's dashboards
//   • unassigned users                          → none
// The scope is applied in the Prisma `where`, never filtered post-fetch.
export const GET = withAuth(async (req) => {
  const role = req.session.user.role;

  let where: { teamId?: string } | undefined;
  if (canViewAllTeams(role)) {
    // View-all roles may narrow to one team via ?teamId= (the admin team
    // switcher). Omitting it returns all teams (org overview). This is still a
    // server-side scope, not client filtering.
    const teamId = req.nextUrl.searchParams.get("teamId");
    where = teamId ? { teamId } : undefined;
  } else {
    const filter = getTeamFilter(req.session);
    // Non-admin with no team assignment: getTeamFilter returns null, which for
    // an admin means "all". Here it means "no access" — return nothing rather
    // than leaking every team's dashboards.
    if (!filter) return NextResponse.json({ dashboards: [] });
    where = { teamId: filter.teamId };
  }

  const dashboards = await prisma.dashboard.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ dashboards });
}, "analytics.view_own_team");
