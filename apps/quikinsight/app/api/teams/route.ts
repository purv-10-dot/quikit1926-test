import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/withAuth";

// GET /api/teams — list all teams. Restricted to roles that can view all teams
// (SUPER_ADMIN / MANAGEMENT). withAuth enforces the "analytics.view_all_teams"
// permission, returning 403 for everyone else — equivalent to canViewAllTeams(role).
export const GET = withAuth(async () => {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  return NextResponse.json({ teams });
}, "analytics.view_all_teams");
