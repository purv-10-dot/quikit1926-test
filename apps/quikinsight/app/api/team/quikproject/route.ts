import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db as _db } from "@quikit/database";

export const runtime = "nodejs";

const db = _db as any;

// ─── dummy fallback (shown when no Qt timesheet data exists for this org) ────

const DUMMY_MEMBERS = [
  { name: "Ali Hassan",    avatar: "AH" },
  { name: "Sara Malik",   avatar: "SM" },
  { name: "Usman Raza",   avatar: "UR" },
  { name: "Nadia Khan",   avatar: "NK" },
  { name: "Bilal Ahmed",  avatar: "BA" },
];

const DUMMY_PROJECTS = ["Website Redesign", "SEO Sprint Q3", "Paid Media Setup", "CRM Integration", "Brand Campaign"];

function randomHours(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function buildDummyDaily() {
  const today = new Date();
  const rows = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    for (const m of DUMMY_MEMBERS) {
      rows.push({
        date: date.toISOString().slice(0, 10),
        user: m.name,
        avatar: m.avatar,
        project: DUMMY_PROJECTS[Math.floor(Math.random() * DUMMY_PROJECTS.length)],
        hours: randomHours(1, 8),
        description: "Feature development",
        dummy: true,
      });
    }
  }
  return rows;
}

function buildDummyWeekly() {
  const today = new Date();
  const rows = [];
  for (let w = 3; w >= 0; w--) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() - w * 7);
    const label = `Week of ${weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
    for (const m of DUMMY_MEMBERS) {
      rows.push({
        week: label,
        user: m.name,
        avatar: m.avatar,
        project: DUMMY_PROJECTS[Math.floor(Math.random() * DUMMY_PROJECTS.length)],
        hours: randomHours(20, 45),
        dummy: true,
      });
    }
  }
  return rows;
}

function buildDummyMonthly() {
  const today = new Date();
  const rows = [];
  for (let m = 2; m >= 0; m--) {
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    for (const member of DUMMY_MEMBERS) {
      rows.push({
        month: label,
        user: member.name,
        avatar: member.avatar,
        project: DUMMY_PROJECTS[Math.floor(Math.random() * DUMMY_PROJECTS.length)],
        hours: randomHours(80, 180),
        dummy: true,
      });
    }
  }
  return rows;
}

// ─── real data builders ───────────────────────────────────────────────────────

async function fetchTimesheetEntries(orgId: string, since: Date) {
  // Resolve Marketing team members via QtTeam, falling back to project-name filter
  const marketingTeam = await db.qtTeam.findFirst({
    where: { orgId, isDeleted: false, name: { equals: "Marketing", mode: "insensitive" } },
    select: { id: true },
  });

  let marketingUserIds: string[] | null = null;
  if (marketingTeam) {
    const members = await db.qtTeamMember.findMany({
      where: { teamId: marketingTeam.id, isDeleted: false },
      select: { userId: true },
    });
    marketingUserIds = members.map((m: { userId: string }) => m.userId);
  }

  const entries = await db.qtTimesheetEntry.findMany({
    where: {
      orgId,
      isDeleted: false,
      entryDate: { gte: since },
      // If no QtTeam found, gate by project name "Marketing"
      ...(marketingUserIds
        ? { userId: { in: marketingUserIds } }
        : { issue: { project: { name: { equals: "Marketing", mode: "insensitive" } } } }),
    },
    select: {
      entryDate: true,
      hours: true,
      description: true,
      userId: true,
      issue: { select: { title: true, project: { select: { name: true } } } },
    },
    orderBy: { entryDate: "desc" },
  });

  if (!entries || entries.length === 0) return [];

  // Resolve userIds → display names in one batch query
  const userIds = [...new Set(entries.map((e: any) => e.userId))] as string[];
  const users: Array<{ id: string; firstName: string; lastName: string }> =
    await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    }).catch(() => []);

  const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  return entries.map((e: any) => ({
    date:        (e.entryDate as Date).toISOString().slice(0, 10),
    user:        userMap.get(e.userId) ?? e.userId,
    avatar:      (userMap.get(e.userId) ?? e.userId).split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase(),
    project:     e.issue?.project?.name ?? "—",
    task:        e.issue?.title ?? "—",
    hours:       e.hours,
    description: e.description ?? "",
    dummy:       false,
  }));
}

// GET /api/team/quikproject?view=daily|weekly|monthly
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = (session.user.orgId as string) ?? "";
  const view  = new URL(req.url).searchParams.get("view") ?? "weekly";

  // All views look back 90 days so historical data is always visible
  const since = new Date();
  if (view === "daily")        since.setDate(since.getDate() - 60);   // ~2 months → day-level granularity
  else if (view === "weekly")  since.setDate(since.getDate() - 90);   // ~13 weeks → week-level granularity
  else                         since.setMonth(since.getMonth() - 6);  // 6 months → month-level granularity

  try {
    const rows = await fetchTimesheetEntries(orgId, since);

    if (rows.length === 0) {
      // Only monthly view gets dummy data as a placeholder; daily/weekly show real data only.
      if (view === "monthly") {
        return NextResponse.json({ view, rows: buildDummyMonthly(), source: "dummy" });
      }
      return NextResponse.json({ view, rows: [], source: "live" });
    }

    // For weekly/monthly views, attach the period label to each row
    if (view === "weekly" || view === "monthly") {
      for (const row of rows as any[]) {
        const d = new Date(row.date);
        if (view === "weekly") {
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          row.week = `Week of ${weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
        } else {
          row.month = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        }
      }
    }

    return NextResponse.json({ view, rows, source: "live" });
  } catch {
    if (view === "monthly") {
      return NextResponse.json({ view, rows: buildDummyMonthly(), source: "dummy" });
    }
    return NextResponse.json({ view, rows: [], source: "live" });
  }
}
