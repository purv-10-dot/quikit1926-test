import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/team/kpis?teamId= — active KPIs for the user's org, sourced from QuikScale schema.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = session.user.orgId as string | undefined;
  if (!orgId) return NextResponse.json({ kpis: [], teams: [] });

  const teamId = req.nextUrl.searchParams.get("teamId") ?? undefined;

  const [kpis, teams] = await Promise.all([
    db.kPI.findMany({
      where: { orgId, deletedAt: null, status: "active", ...(teamId ? { teamId } : {}) },
      select: {
        id:              true,
        name:            true,
        kpiLevel:        true,
        quarter:         true,
        year:            true,
        measurementUnit: true,
        target:          true,
        progressPercent: true,
        healthStatus:    true,
        teamId:          true,
        owner_user: { select: { id: true, firstName: true, lastName: true } },
        team:       { select: { id: true, name: true } },
      },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    db.qsTeam.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ kpis, teams });
}
