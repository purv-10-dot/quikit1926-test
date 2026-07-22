import { db } from "@/lib/db";
import { buildWeekBucketsBetween, emptyCounts, indexByWeek, weekKeyOf } from "./weekly";
import { resolveRange, type RangePreset, type ResolveOptions } from "./ranges";
import { calculateProductivity } from "./productivity";
import { hasAdminAccess, spaceAdminProjectIds } from "@/lib/api/permissions";

/**
 * Full per-employee productivity list for the Executive Report, sorted by
 * productivity desc. The main report route caps this to the top 10 for its
 * payload; this shared loader returns the WHOLE list so the dedicated
 * /api/reports/executive/employees endpoint can paginate it (productivity is a
 * computed sort, so it can't be paginated in SQL — we aggregate then slice).
 */
export interface ExecutiveEmployeeRow {
  userId: string;
  name: string;
  avatar: string | null;
  teamName: string | null;
  productivity: number;
  tasksClosed: number;
  onTimeRate: number;
  trend: number[];
  delta: number | null;
}

interface WeekBuckets {
  created: number[];
  closed: number[];
  slipped: number[];
  closedOnTime: number[];
  estHours: number[];
  actualHours: number[];
}

export async function loadExecutiveEmployees(args: {
  orgId: string;
  userId: string;
  searchParams: URLSearchParams;
}): Promise<ExecutiveEmployeeRow[]> {
  const { orgId, userId, searchParams: sp } = args;

  const org = await db.org.findUnique({ where: { id: orgId }, select: { quarterStartMonth: true } });
  const quarterStartMonth = org?.quarterStartMonth ?? 1;
  const range = resolveRange((sp.get("preset") ?? "last-90") as RangePreset, {
    quarterStartMonth,
    year: sp.get("year") ? Number(sp.get("year")) : undefined,
    quarter: sp.get("quarter") ? Number(sp.get("quarter")) : undefined,
    month: sp.get("month") ? Number(sp.get("month")) : undefined,
    customFrom: sp.get("from") ?? undefined,
    customTo: sp.get("to") ?? undefined,
  } satisfies ResolveOptions);

  const projectFilter = parseCsv(sp.get("projectIds"));
  const assigneeFilter = parseCsv(sp.get("assigneeIds"));
  const teamFilter = parseCsv(sp.get("teamIds"));
  const sprintFilter = parseCsv(sp.get("sprintIds"));

  // Org admins see all projects; Space Admins only the projects they administer.
  // Matches the executive route's access model (hasAdminAccess + Space Admin).
  const isAdmin = await hasAdminAccess(userId, orgId);

  let visibleProjectIds: string[] | null = null;
  if (!isAdmin) {
    visibleProjectIds = await spaceAdminProjectIds(userId, orgId);
    if (visibleProjectIds.length === 0) return [];
  }

  let effectiveProjectIds: string[] | undefined;
  if (projectFilter.length > 0 && visibleProjectIds) {
    effectiveProjectIds = projectFilter.filter((p) => visibleProjectIds!.includes(p));
    if (effectiveProjectIds.length === 0) return [];
  } else if (projectFilter.length > 0) {
    effectiveProjectIds = projectFilter;
  } else if (visibleProjectIds) {
    effectiveProjectIds = visibleProjectIds;
  }

  let teamScopedUserIds: string[] | undefined;
  if (teamFilter.length > 0) {
    const wanted = teamFilter.map((s) => s.toLowerCase());
    const tm = await db.qtProjectUserRole.findMany({
      where: {
        projectRole: { orgId, name: { in: teamFilter, mode: "insensitive" } },
        ...(visibleProjectIds ? { projectId: { in: visibleProjectIds } } : {}),
      },
      select: { userId: true, projectRole: { select: { name: true } } },
    });
    teamScopedUserIds = Array.from(
      new Set(tm.filter((m) => wanted.includes(m.projectRole.name.toLowerCase())).map((m) => m.userId)),
    );
    if (teamScopedUserIds.length === 0) return [];
  }

  const effectiveAssigneeIds = intersectIds(assigneeFilter, teamScopedUserIds);
  if (effectiveAssigneeIds && effectiveAssigneeIds.length === 0) return [];

  const weeks = buildWeekBucketsBetween(range.from, range.to);
  const weekIndex = indexByWeek(weeks);
  const wb = weeks.length;
  const idxOf = (date: Date): number | null => weekIndex.get(weekKeyOf(date)) ?? null;

  const projectScope = effectiveProjectIds ? { projectId: { in: effectiveProjectIds } } : {};
  const assigneeScope =
    effectiveAssigneeIds && effectiveAssigneeIds.length > 0 ? { assigneeId: { in: effectiveAssigneeIds } } : {};
  const sprintScope = sprintFilter.length > 0 ? { sprintId: { in: sprintFilter } } : {};
  const baseIssueWhere = { orgId, isDeleted: false, ...projectScope, ...assigneeScope, ...sprintScope };

  const [createdIssues, closedIssues, slippedIssues, timesheetEntries, teamMembers, assigneeUsers] =
    await Promise.all([
      db.qtIssue.findMany({
        where: { ...baseIssueWhere, createdAt: { gte: range.from, lt: range.to } },
        select: { assigneeId: true, createdAt: true, eta: true },
      }),
      db.qtIssue.findMany({
        where: { ...baseIssueWhere, updatedAt: { gte: range.from, lt: range.to }, status: { category: "DONE" } },
        select: { assigneeId: true, updatedAt: true, dueDate: true },
      }),
      db.qtIssue.findMany({
        where: {
          ...baseIssueWhere,
          dueDate: { gte: range.from, lt: range.to },
          status: { category: { not: "DONE" } },
        },
        select: { assigneeId: true, dueDate: true },
      }),
      db.qtTimesheetEntry.findMany({
        where: {
          orgId,
          isDeleted: false,
          entryDate: { gte: range.from, lt: range.to },
          ...(effectiveProjectIds ? { projectId: { in: effectiveProjectIds } } : {}),
          ...(effectiveAssigneeIds && effectiveAssigneeIds.length > 0 ? { userId: { in: effectiveAssigneeIds } } : {}),
        },
        select: { userId: true, hours: true, entryDate: true },
      }),
      db.qtProjectUserRole.findMany({
        where: {
          projectRole: { orgId },
          ...(effectiveProjectIds ? { projectId: { in: effectiveProjectIds } } : {}),
        },
        select: { userId: true, projectRole: { select: { name: true } } },
      }),
      db.user.findMany({
        where:
          effectiveAssigneeIds && effectiveAssigneeIds.length > 0
            ? { id: { in: effectiveAssigneeIds } }
            : { memberships: { some: { orgId, status: "active" } } },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        take: 2000,
      }),
    ]);

  const perUser = new Map<string, WeekBuckets>();
  const newBuckets = (): WeekBuckets => ({
    created: emptyCounts(wb),
    closed: emptyCounts(wb),
    slipped: emptyCounts(wb),
    closedOnTime: emptyCounts(wb),
    estHours: emptyCounts(wb),
    actualHours: emptyCounts(wb),
  });
  function bump(u: string | null): WeekBuckets | null {
    if (!u) return null;
    let row = perUser.get(u);
    if (!row) {
      row = newBuckets();
      perUser.set(u, row);
    }
    return row;
  }

  const userTeam = new Map<string, string>();
  const teamLabel = new Map<string, string>();
  for (const tm of teamMembers) {
    const key = tm.projectRole.name.toLowerCase();
    if (!userTeam.has(tm.userId)) userTeam.set(tm.userId, key);
    if (!teamLabel.has(key)) teamLabel.set(key, tm.projectRole.name);
  }

  for (const t of createdIssues) {
    const idx = idxOf(t.createdAt);
    if (idx === null) continue;
    const ub = bump(t.assigneeId);
    if (ub) {
      ub.created[idx]! += 1;
      if (t.eta != null) ub.estHours[idx]! += t.eta;
    }
  }
  for (const t of closedIssues) {
    const idx = idxOf(t.updatedAt);
    if (idx === null) continue;
    const ub = bump(t.assigneeId);
    if (ub) {
      ub.closed[idx]! += 1;
      if (t.dueDate && t.updatedAt <= t.dueDate) ub.closedOnTime[idx]! += 1;
    }
  }
  for (const t of slippedIssues) {
    if (!t.dueDate) continue;
    const idx = idxOf(t.dueDate);
    if (idx === null) continue;
    const ub = bump(t.assigneeId);
    if (ub) ub.slipped[idx]! += 1;
  }
  for (const ts of timesheetEntries) {
    const idx = idxOf(ts.entryDate);
    if (idx === null || !ts.userId) continue;
    const ub = bump(ts.userId);
    if (ub) ub.actualHours[idx]! += ts.hours;
  }

  // Every org member in scope gets a row — those with no activity in the range
  // show 0% / 0 tasks (not dropped), so "View All" lists the full roster, not
  // just the active few. Active people sort to the top.
  const emptyBuckets = newBuckets();
  const rows: ExecutiveEmployeeRow[] = assigneeUsers.map((meta) => {
    const row = perUser.get(meta.id) ?? emptyBuckets;
    const totalClosed = sum(row.closed);
    const teamKey = userTeam.get(meta.id);
    return {
      userId: meta.id,
      name: nameOf(meta),
      avatar: meta.avatar ?? null,
      teamName: teamKey ? teamLabel.get(teamKey) ?? null : null,
      productivity: calculateProductivity({
        created: sum(row.created),
        closed: totalClosed,
        slipped: sum(row.slipped),
        closedOnTime: sum(row.closedOnTime),
        estHours: sum(row.estHours),
        actualHours: sum(row.actualHours),
      }),
      tasksClosed: totalClosed,
      onTimeRate: totalClosed > 0 ? Math.round((sum(row.closedOnTime) / totalClosed) * 100) : 0,
      trend: row.created.map((c, i) =>
        c === 0 && row.closed[i]! === 0 && row.slipped[i]! === 0
          ? 0
          : calculateProductivity({
              created: c,
              closed: row.closed[i]!,
              slipped: row.slipped[i]!,
              closedOnTime: row.closedOnTime[i]!,
              estHours: row.estHours[i]!,
              actualHours: row.actualHours[i]!,
            }),
      ),
      delta: null,
    };
  });

  return rows.sort(
    (a, b) => b.productivity - a.productivity || b.tasksClosed - a.tasksClosed || a.name.localeCompare(b.name),
  );
}

function parseCsv(v: string | null): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function intersectIds(a: string[], b: string[] | undefined): string[] | undefined {
  if (!b) return a.length > 0 ? a : undefined;
  if (a.length === 0) return b;
  return a.filter((id) => b.includes(id));
}

function sum(arr: number[]): number {
  let total = 0;
  for (const n of arr) total += n;
  return total;
}

function nameOf(u: { firstName: string | null; lastName: string | null; email: string }): string {
  const combined = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return combined.length > 0 ? combined : u.email;
}
