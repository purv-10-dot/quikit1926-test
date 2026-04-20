import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("dashboard");

// Shared selects — keep payload small by only returning what the dashboard actually renders.
const KPI_SELECT = {
  id: true,
  name: true,
  description: true,
  kpiLevel: true,
  owner: true,
  ownerIds: true,
  ownerContributions: true,
  teamId: true,
  quarter: true,
  year: true,
  measurementUnit: true,
  target: true,
  quarterlyGoal: true,
  qtdGoal: true,
  qtdAchieved: true,
  progressPercent: true,
  status: true,
  healthStatus: true,
  lastNotes: true,
  lastNotesAt: true,
  divisionType: true,
  weeklyTargets: true,
  weeklyOwnerTargets: true,
  currency: true,
  targetScale: true,
  reverseColor: true,
  createdAt: true,
  updatedAt: true,
  owner_user: { select: { id: true, firstName: true, lastName: true } },
  team: { select: { id: true, name: true, color: true, headId: true } },
  weeklyValues: {
    select: { userId: true, weekNumber: true, value: true, notes: true },
    orderBy: [{ weekNumber: "asc" as const }, { userId: "asc" as const }],
  },
};

const PRIORITY_SELECT = {
  id: true,
  name: true,
  description: true,
  owner: true,
  teamId: true,
  quarter: true,
  year: true,
  startWeek: true,
  endWeek: true,
  overallStatus: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  owner_user: { select: { id: true, firstName: true, lastName: true } },
  team: { select: { id: true, name: true } },
  weeklyStatuses: {
    select: { id: true, priorityId: true, weekNumber: true, status: true, notes: true },
    orderBy: { weekNumber: "asc" as const },
  },
};

const KPI_CAP = 100;

const querySchema = z.object({
  year: z.coerce.number().int().min(1900).max(9999),
  quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
});

type RawKPI = Awaited<ReturnType<typeof fetchKpis>>[number];

async function fetchKpis(tenantId: string, year: number, quarter: string, kpiLevel: "individual" | "team") {
  return db.kPI.findMany({
    where: { tenantId, year, quarter, kpiLevel },
    select: KPI_SELECT,
    orderBy: { createdAt: "desc" },
    take: KPI_CAP,
  });
}

function enrichKpis(
  kpis: RawKPI[],
  usersMap: Map<string, { id: string; firstName: string; lastName: string }>,
) {
  return kpis.map((k) => {
    const ownerIds = (k.ownerIds as string[] | null) ?? [];
    const rawWeekly = (k.weeklyValues ?? []) as Array<{
      userId: string | null;
      weekNumber: number;
      value: number | null;
      notes: string | null;
    }>;

    let weeklyValues = rawWeekly.map(({ weekNumber, value, notes }) => ({ weekNumber, value, notes }));
    let weeklyOwnerValues:
      | Record<string, Array<{ weekNumber: number; value: number | null; notes: string | null }>>
      | undefined;

    if (k.kpiLevel === "team") {
      const byWeek: Record<number, { value: number; notes: string | null }> = {};
      const byOwner: Record<string, Array<{ weekNumber: number; value: number | null; notes: string | null }>> = {};
      for (const row of rawWeekly) {
        const v = row.value ?? 0;
        if (!byWeek[row.weekNumber]) byWeek[row.weekNumber] = { value: 0, notes: null };
        byWeek[row.weekNumber].value += v;
        if (row.notes) {
          byWeek[row.weekNumber].notes = byWeek[row.weekNumber].notes
            ? `${byWeek[row.weekNumber].notes}\n${row.notes}`
            : row.notes;
        }
        if (row.userId) {
          if (!byOwner[row.userId]) byOwner[row.userId] = [];
          byOwner[row.userId].push({ weekNumber: row.weekNumber, value: row.value, notes: row.notes });
        }
      }
      weeklyValues = Object.entries(byWeek)
        .map(([weekStr, agg]) => ({
          weekNumber: parseInt(weekStr, 10),
          value: agg.value,
          notes: agg.notes,
        }))
        .sort((a, b) => a.weekNumber - b.weekNumber);
      weeklyOwnerValues = byOwner;
    }

    return {
      ...k,
      weeklyValues,
      weeklyOwnerValues,
      team: k.team
        ? { ...k.team, head: k.team.headId ? (usersMap.get(k.team.headId) ?? null) : null }
        : null,
      owners: ownerIds.map((id) => usersMap.get(id)).filter(Boolean),
    };
  });
}

// GET /api/dashboard/summary?year=<n>&quarter=Q1|Q2|Q3|Q4
// Consolidated dashboard payload — replaces 6 separate client queries
// (individual KPIs, team KPIs, priorities, WWW items, teams, users) with
// a single server round-trip using Promise.all.
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const parsed = querySchema.safeParse({
    year: req.nextUrl.searchParams.get("year"),
    quarter: req.nextUrl.searchParams.get("quarter"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid or missing year/quarter" },
      { status: 400 },
    );
  }
  const { year, quarter } = parsed.data;

  const [individualKpisRaw, teamKpisRaw, priorities, wwwItemsRaw, teams, memberships] = await Promise.all([
    fetchKpis(tenantId, year, quarter, "individual"),
    fetchKpis(tenantId, year, quarter, "team"),
    db.priority.findMany({
      where: { tenantId, year, quarter },
      select: PRIORITY_SELECT,
      orderBy: { createdAt: "asc" },
    }),
    db.wWWItem.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    }),
    db.team.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.membership.findMany({
      where: { tenantId, status: "active" },
      select: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Build a shared user map for KPI owner enrichment + WWW who_user attachment.
  const userIdsToFetch = new Set<string>();
  for (const k of [...individualKpisRaw, ...teamKpisRaw]) {
    if (k.team?.headId) userIdsToFetch.add(k.team.headId);
    const ids = (k.ownerIds as string[] | null) ?? [];
    for (const id of ids) userIdsToFetch.add(id);
  }
  for (const w of wwwItemsRaw) {
    if (w.who) userIdsToFetch.add(w.who);
  }

  const usersMap = userIdsToFetch.size > 0
    ? new Map(
        (await db.user.findMany({
          where: { id: { in: [...userIdsToFetch] } },
          select: { id: true, firstName: true, lastName: true },
        })).map((u) => [u.id, u]),
      )
    : new Map<string, { id: string; firstName: string; lastName: string }>();

  const individualKPIs = enrichKpis(individualKpisRaw, usersMap);
  const teamKPIs = enrichKpis(teamKpisRaw, usersMap);

  const wwwItems = wwwItemsRaw.map((item) => ({
    ...item,
    when: item.when.toISOString(),
    originalDueDate: item.originalDueDate?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    who_user: usersMap.get(item.who) ?? null,
  }));

  const users = memberships.map((m) => m.user).filter(Boolean);

  return NextResponse.json({
    success: true,
    data: {
      individualKPIs,
      teamKPIs,
      priorities,
      wwwItems,
      teams,
      users,
    },
  });
});
