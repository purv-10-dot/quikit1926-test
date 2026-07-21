import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, spaceAdminProjectIds } from "@/lib/api/permissions";
import {
  buildWeekBucketsBetween,
  bumpForDate,
  emptyCounts,
  indexByWeek,
  type WeekBucket,
} from "@/lib/reports/weekly";
import {
  resolveCompareRange,
  resolveRange,
  type CompareMode,
  type RangePreset,
  type ResolveOptions,
  type ResolvedRange,
} from "@/lib/reports/ranges";
import {
  averageVelocity,
  calculateProductivity,
  delayedRate,
} from "@/lib/reports/productivity";

interface IssueSlim {
  id: string;
  projectId: string;
  assigneeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  dueDate: Date | null;
  eta: number | null;
  priority: string;
  status: { category: string; name: string } | null;
}

/**
 * Executive Productivity Dashboard API.
 *
 * Returns per-week and per-team productivity signals derived from QtIssue,
 * QtTimesheetEntry, and QtTeam/QtTeamMember. The "productivity score" is a
 * composite of completion, on-time delivery, slip rate and hours variance —
 * see lib/reports/productivity.ts for the formula.
 *
 * Closed buckets by `updatedAt` filtered to DONE — a proxy until a real
 * `closedAt` column lands.
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);

  const org = await db.org.findUnique({
    where: { id: orgId },
    select: { quarterStartMonth: true },
  });
  const quarterStartMonth = org?.quarterStartMonth ?? 1;

  const range = parseRangeFromUrl(url, quarterStartMonth);
  const compareMode = (url.searchParams.get("compareMode") ?? "none") as CompareMode;

  const projectFilter = parseCsv(url.searchParams.get("projectIds"));
  const assigneeFilter = parseCsv(url.searchParams.get("assigneeIds"));
  const teamFilter = parseCsv(url.searchParams.get("teamIds"));
  const sprintFilter = parseCsv(url.searchParams.get("sprintIds"));

  // Access model: org admins (all projects) OR Space Admins (only projects they
  // administer). Uses hasAdminAccess for consistency with the other report
  // routes (the old raw `member.role === "admin"` check missed app-admins and
  // the v4 tier role names). Regular members get an empty report.
  const isAdmin = await hasAdminAccess(userId, orgId);

  let visibleProjectIds: string[] | null = null;
  if (!isAdmin) {
    visibleProjectIds = await spaceAdminProjectIds(userId, orgId);
    if (visibleProjectIds.length === 0) {
      return NextResponse.json({ success: true, data: emptyResponse(range) });
    }
  }

  let effectiveProjectIds: string[] | undefined;
  if (projectFilter.length > 0 && visibleProjectIds) {
    effectiveProjectIds = projectFilter.filter((p) => visibleProjectIds!.includes(p));
    if (effectiveProjectIds.length === 0) {
      return NextResponse.json({ success: true, data: emptyResponse(range) });
    }
  } else if (projectFilter.length > 0) {
    effectiveProjectIds = projectFilter;
  } else if (visibleProjectIds) {
    effectiveProjectIds = visibleProjectIds;
  }

  // "Department" in this report is sourced from QtProjectRole names (e.g.
  // Space Admin, Contributor, Viewer). Each project has its own copy
  // of these roles; we group by role NAME so the same label across projects
  // collapses to one dropdown entry. The filter param is still called
  // `teamIds` for stability and carries the role-name slugs.
  //
  // We fetch the full role list early so emptyResponse() can include the
  // dropdown options even when a filter resolves to zero users — otherwise
  // picking a role with no assignees would wipe out the dropdown itself.
  const allOrgRoles = await db.qtProjectRole.findMany({
    where: {
      orgId,
      ...(visibleProjectIds ? { projectId: { in: visibleProjectIds } } : {}),
    },
    select: { name: true },
    take: 500,
  });
  const departmentOptions = dedupeDepartmentOptions(allOrgRoles);

  let teamScopedUserIds: string[] | undefined;
  if (teamFilter.length > 0) {
    const wanted = teamFilter.map((s) => s.toLowerCase());
    const tm = await db.qtProjectUserRole.findMany({
      where: {
        projectRole: {
          orgId,
          name: { in: teamFilter, mode: "insensitive" },
        },
        ...(visibleProjectIds ? { projectId: { in: visibleProjectIds } } : {}),
      },
      select: { userId: true, projectRole: { select: { name: true } } },
    });
    teamScopedUserIds = Array.from(
      new Set(tm.filter((m) => wanted.includes(m.projectRole.name.toLowerCase())).map((m) => m.userId)),
    );
    if (teamScopedUserIds.length === 0) {
      return NextResponse.json({ success: true, data: emptyResponse(range, departmentOptions) });
    }
  }

  const effectiveAssigneeIds = intersectIds(assigneeFilter, teamScopedUserIds);
  if (effectiveAssigneeIds && effectiveAssigneeIds.length === 0) {
    return NextResponse.json({ success: true, data: emptyResponse(range, departmentOptions) });
  }

  const weeks = buildWeekBucketsBetween(range.from, range.to);
  const weekIndex = indexByWeek(weeks);

  const projectScope = effectiveProjectIds ? { projectId: { in: effectiveProjectIds } } : {};
  const assigneeScope = effectiveAssigneeIds && effectiveAssigneeIds.length > 0
    ? { assigneeId: { in: effectiveAssigneeIds } }
    : {};
  const sprintScope = sprintFilter.length > 0 ? { sprintId: { in: sprintFilter } } : {};

  const baseIssueWhere = {
    orgId,
    isDeleted: false,
    ...projectScope,
    ...assigneeScope,
    ...sprintScope,
  };

  const [
    createdIssues,
    closedIssues,
    slippedIssues,
    blockedIssues,
    timesheetEntries,
    projectMeta,
    teams,
    teamMembers,
    sprints,
    assigneeUsers,
  ] = await Promise.all([
    db.qtIssue.findMany({
      where: { ...baseIssueWhere, createdAt: { gte: range.from, lt: range.to } },
      select: pickIssueShape(),
    }),
    db.qtIssue.findMany({
      where: {
        ...baseIssueWhere,
        updatedAt: { gte: range.from, lt: range.to },
        status: { category: "DONE" },
      },
      select: pickIssueShape(),
    }),
    db.qtIssue.findMany({
      where: {
        ...baseIssueWhere,
        dueDate: { gte: range.from, lt: range.to },
        status: { category: { not: "DONE" } },
      },
      select: pickIssueShape(),
    }),
    // "Blocked" — best-effort proxy: status name contains "block" and not DONE.
    db.qtIssue.findMany({
      where: {
        ...baseIssueWhere,
        updatedAt: { gte: range.from, lt: range.to },
        status: {
          AND: [{ category: { not: "DONE" } }, { name: { contains: "block", mode: "insensitive" } }],
        },
      },
      select: pickIssueShape(),
    }),
    db.qtTimesheetEntry.findMany({
      where: {
        orgId,
        isDeleted: false,
        entryDate: { gte: range.from, lt: range.to },
        ...(effectiveProjectIds ? { projectId: { in: effectiveProjectIds } } : {}),
        ...(effectiveAssigneeIds && effectiveAssigneeIds.length > 0
          ? { userId: { in: effectiveAssigneeIds } }
          : {}),
      },
      select: { projectId: true, userId: true, hours: true, entryDate: true },
    }),
    db.qtProject.findMany({
      where: {
        orgId,
        isDeleted: false,
        ...(effectiveProjectIds ? { id: { in: effectiveProjectIds } } : {}),
      },
      select: { id: true, name: true, color: true, projectKey: true },
    }),
    db.qtProjectRole.findMany({
      where: {
        orgId,
        ...(effectiveProjectIds ? { projectId: { in: effectiveProjectIds } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    db.qtProjectUserRole.findMany({
      where: {
        projectRole: { orgId },
        ...(effectiveProjectIds ? { projectId: { in: effectiveProjectIds } } : {}),
      },
      select: {
        userId: true,
        projectRole: { select: { id: true, name: true } },
      },
    }),
    db.qtSprint.findMany({
      where: {
        isDeleted: false,
        project: { orgId, isDeleted: false },
        ...(effectiveProjectIds ? { projectId: { in: effectiveProjectIds } } : {}),
      },
      select: { id: true, name: true, projectId: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    // Just enough user metadata for the employee table & scatter labels.
    db.user.findMany({
      where: {
        ...(effectiveAssigneeIds && effectiveAssigneeIds.length > 0
          ? { id: { in: effectiveAssigneeIds } }
          : { memberships: { some: { orgId, status: "active" } } }),
      },
      select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      take: 500,
    }),
  ]);

  const wb = weeks.length;
  const createdSeries = emptyCounts(wb);
  const closedSeries = emptyCounts(wb);
  const slippedSeries = emptyCounts(wb);
  const blockedSeries = emptyCounts(wb);
  const estHoursSeries = emptyCounts(wb);
  const actualHoursSeries = emptyCounts(wb);

  type WeekBuckets = {
    created: number[];
    closed: number[];
    slipped: number[];
    closedOnTime: number[];
    estHours: number[];
    actualHours: number[];
  };
  const newBuckets = (): WeekBuckets => ({
    created: emptyCounts(wb),
    closed: emptyCounts(wb),
    slipped: emptyCounts(wb),
    closedOnTime: emptyCounts(wb),
    estHours: emptyCounts(wb),
    actualHours: emptyCounts(wb),
  });

  const perUser = new Map<string, WeekBuckets>();
  const perTeam = new Map<string, WeekBuckets>();
  const usersWithActivity = new Set<string>();

  function bumpUser(u: string | null) {
    if (!u) return null;
    let row = perUser.get(u);
    if (!row) {
      row = newBuckets();
      perUser.set(u, row);
    }
    usersWithActivity.add(u);
    return row;
  }
  // userId -> role-name key (department). A user can have different project
  // roles in different projects; we take the first for grouping. We key by
  // the lowercased name so the same role label across projects collapses
  // into a single department row.
  const userTeam = new Map<string, string>();
  const teamLabel = new Map<string, string>();
  for (const tm of teamMembers) {
    const key = tm.projectRole.name.toLowerCase();
    if (!userTeam.has(tm.userId)) userTeam.set(tm.userId, key);
    if (!teamLabel.has(key)) teamLabel.set(key, tm.projectRole.name);
  }

  function bumpTeamForUser(u: string | null): WeekBuckets | null {
    if (!u) return null;
    const tid = userTeam.get(u);
    if (!tid) return null;
    let row = perTeam.get(tid);
    if (!row) {
      row = newBuckets();
      perTeam.set(tid, row);
    }
    return row;
  }

  for (const t of createdIssues as IssueSlim[]) {
    const idx = bumpForDate(createdSeries, weekIndex, t.createdAt);
    if (idx === null) continue;
    const ub = bumpUser(t.assigneeId);
    const tb = bumpTeamForUser(t.assigneeId);
    if (ub) ub.created[idx]! += 1;
    if (tb) tb.created[idx]! += 1;
    if (t.eta != null) {
      bumpForDate(estHoursSeries, weekIndex, t.createdAt, t.eta);
      if (ub) ub.estHours[idx]! += t.eta;
      if (tb) tb.estHours[idx]! += t.eta;
    }
  }
  for (const t of closedIssues as IssueSlim[]) {
    const idx = bumpForDate(closedSeries, weekIndex, t.updatedAt);
    if (idx === null) continue;
    const ub = bumpUser(t.assigneeId);
    const tb = bumpTeamForUser(t.assigneeId);
    if (ub) ub.closed[idx]! += 1;
    if (tb) tb.closed[idx]! += 1;
    if (t.dueDate && t.updatedAt <= t.dueDate) {
      if (ub) ub.closedOnTime[idx]! += 1;
      if (tb) tb.closedOnTime[idx]! += 1;
    }
  }
  for (const t of slippedIssues as IssueSlim[]) {
    if (!t.dueDate) continue;
    const idx = bumpForDate(slippedSeries, weekIndex, t.dueDate);
    if (idx === null) continue;
    const ub = bumpUser(t.assigneeId);
    const tb = bumpTeamForUser(t.assigneeId);
    if (ub) ub.slipped[idx]! += 1;
    if (tb) tb.slipped[idx]! += 1;
  }
  for (const t of blockedIssues as IssueSlim[]) {
    bumpForDate(blockedSeries, weekIndex, t.updatedAt);
  }
  for (const ts of timesheetEntries) {
    const idx = bumpForDate(actualHoursSeries, weekIndex, ts.entryDate, ts.hours);
    if (idx === null) continue;
    if (ts.userId) {
      const ub = bumpUser(ts.userId);
      const tb = bumpTeamForUser(ts.userId);
      if (ub) ub.actualHours[idx]! += ts.hours;
      if (tb) tb.actualHours[idx]! += ts.hours;
    }
  }

  // Composite productivity per week (org-level).
  const productivitySeries = weeks.map((_, i) =>
    calculateProductivity({
      created: createdSeries[i]!,
      closed: closedSeries[i]!,
      slipped: slippedSeries[i]!,
      closedOnTime: null,
      estHours: estHoursSeries[i]!,
      actualHours: actualHoursSeries[i]!,
    }),
  );

  // Aggregate previous-period series for the comparison overlay.
  const compareRange = resolveCompareRange(range, compareMode);
  let previous: PreviousSeriesShape | undefined;
  if (compareRange) {
    previous = await loadCompareSeries({
      baseIssueWhere,
      compareRange,
    });
  }

  // Department productivity rows (bar chart + heatmap). Roles are deduped by
  // lowercase name so the same role across projects rolls up into one row.
  // We also include any role name from `teams` that has zero activity so the
  // dropdown labels stay aligned with what the bar chart shows.
  const departmentKeys = new Set<string>(teamLabel.keys());
  for (const t of teams) {
    const k = t.name.toLowerCase();
    departmentKeys.add(k);
    if (!teamLabel.has(k)) teamLabel.set(k, t.name);
  }

  const teamRows = Array.from(departmentKeys)
    .map((key) => {
      const teamName = teamLabel.get(key) ?? key;
      const row = perTeam.get(key);
      if (!row) {
        return {
          teamId: key,
          teamName,
          productivity: 0,
          delta: null as number | null,
          created: 0,
          closed: 0,
          cells: weeks.map((_, idx) => ({
            weekIdx: idx,
            productivity: null as number | null,
            created: 0,
            closed: 0,
          })),
          avgScore: 0,
        };
      }
      const cells = weeks.map((_, idx) => {
        const c = row.created[idx]!;
        const k = row.closed[idx]!;
        const score =
          c === 0 && k === 0 && row.slipped[idx]! === 0
            ? null
            : calculateProductivity({
                created: c,
                closed: k,
                slipped: row.slipped[idx]!,
                closedOnTime: row.closedOnTime[idx]!,
                estHours: row.estHours[idx]!,
                actualHours: row.actualHours[idx]!,
              });
        return { weekIdx: idx, productivity: score, created: c, closed: k };
      });
      const validScores = cells.map((c) => c.productivity).filter((n): n is number => n !== null);
      const totalCreated = sum(row.created);
      const totalClosed = sum(row.closed);
      const productivity = calculateProductivity({
        created: totalCreated,
        closed: totalClosed,
        slipped: sum(row.slipped),
        closedOnTime: sum(row.closedOnTime),
        estHours: sum(row.estHours),
        actualHours: sum(row.actualHours),
      });
      const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
      return {
        teamId: key,
        teamName,
        productivity,
        delta: null as number | null,
        created: totalCreated,
        closed: totalClosed,
        cells,
        avgScore,
      };
    })
    .filter((r) =>
      teamFilter.length === 0
        ? true
        : teamFilter.some((f) => f.toLowerCase() === r.teamId.toLowerCase()),
    );

  // Per-employee productivity table & workload scatter.
  const employees = Array.from(perUser.entries())
    .map(([uid, row]) => {
      const meta = assigneeUsers.find((u) => u.id === uid);
      if (!meta) return null;
      const teamKey = userTeam.get(uid);
      const teamName = teamKey ? teamLabel.get(teamKey) ?? null : null;
      const totalCreated = sum(row.created);
      const totalClosed = sum(row.closed);
      const onTimeRate = totalClosed > 0 ? Math.round((sum(row.closedOnTime) / totalClosed) * 100) : 0;
      const productivity = calculateProductivity({
        created: totalCreated,
        closed: totalClosed,
        slipped: sum(row.slipped),
        closedOnTime: sum(row.closedOnTime),
        estHours: sum(row.estHours),
        actualHours: sum(row.actualHours),
      });
      const trend = row.created.map((c, i) =>
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
      );
      const hoursLogged = round1(sum(row.actualHours));
      return {
        userId: uid,
        name: nameOf(meta),
        avatar: meta.avatar ?? null,
        teamName,
        productivity,
        tasksClosed: totalClosed,
        onTimeRate,
        trend,
        delta: null as number | null,
        // workload metrics
        hoursLogged,
      };
    })
    .filter(<T,>(v: T | null): v is T => v !== null);

  // Workload scatter: normalize hours to a 0-200% scale around the median.
  const allHours = employees.map((e) => e.hoursLogged).filter((h) => h > 0);
  const medianHours = median(allHours);
  const workload = employees
    .filter((e) => e.hoursLogged > 0 || e.tasksClosed > 0)
    .map((e) => ({
      userId: e.userId,
      name: e.name,
      workload:
        medianHours > 0 ? Math.round((e.hoursLogged / medianHours) * 100) : e.hoursLogged > 0 ? 100 : 0,
      productivity: e.productivity,
      hoursLogged: e.hoursLogged,
      tasksClosed: e.tasksClosed,
    }))
    .sort((a, b) => b.workload - a.workload);

  // Top employees sorted by productivity desc, limit 10.
  const topEmployees = employees
    .filter((e) => e.tasksClosed > 0 || e.hoursLogged > 0)
    .sort((a, b) => b.productivity - a.productivity)
    .slice(0, 10)
    .map((e) => ({
      userId: e.userId,
      name: e.name,
      avatar: e.avatar,
      teamName: e.teamName,
      productivity: e.productivity,
      tasksClosed: e.tasksClosed,
      onTimeRate: e.onTimeRate,
      trend: e.trend,
      delta: e.delta,
    }));

  // Sort team rows by productivity desc — that matches the image's "Engineering 88%" first.
  teamRows.sort((a, b) => b.productivity - a.productivity);

  // Slipping/blocked combined series for the chart.
  const slipping = weeks.map((w, i) => ({
    weekStart: w.weekStart,
    weekLabel: w.weekLabel,
    slipped: slippedSeries[i]!,
    blocked: blockedSeries[i]!,
  }));

  const totalCreated = sum(createdSeries);
  const totalClosed = sum(closedSeries);
  const totalSlipped = sum(slippedSeries);
  const summary = {
    productivity: calculateProductivity({
      created: totalCreated,
      closed: totalClosed,
      slipped: totalSlipped,
      closedOnTime: null,
      estHours: sum(estHoursSeries),
      actualHours: sum(actualHoursSeries),
    }),
    totalCreated,
    totalClosed,
    totalSlipped,
    closedPct: totalCreated > 0 ? Math.round((totalClosed / totalCreated) * 100) : 0,
    velocity: averageVelocity(closedSeries),
    delayedPct: delayedRate(totalCreated, totalSlipped),
    estHours: round1(sum(estHoursSeries)),
    actualHours: round1(sum(actualHoursSeries)),
  };

  // Fold previous-period deltas into team rows once we have the comparison.
  if (previous?.teamRows) {
    const prevByTeam = new Map(previous.teamRows.map((r) => [r.teamId, r.productivity]));
    for (const row of teamRows) {
      const prev = prevByTeam.get(row.teamId);
      if (prev !== undefined) row.delta = row.productivity - prev;
    }
  }

  // Week-over-week summary — the dashboard's headline framing. Always derived
  // from the LAST week vs the WEEK BEFORE inside the current range, regardless
  // of whether the user picked a week, month, quarter, or year. This is the
  // "is the company improving week over week?" question the executive view
  // exists to answer.
  const wow = computeWeekOverWeek({
    weeks,
    productivity: productivitySeries,
    created: createdSeries,
    closed: closedSeries,
    slipped: slippedSeries,
  });

  return NextResponse.json({
    success: true,
    data: {
      range: {
        from: range.from.toISOString().slice(0, 10),
        to: range.to.toISOString().slice(0, 10),
        label: range.label,
      },
      weeks,
      series: {
        productivity: productivitySeries,
        created: createdSeries,
        closed: closedSeries,
        slipped: slippedSeries,
        blocked: blockedSeries,
        estHours: estHoursSeries.map(round1),
        actualHours: actualHoursSeries.map(round1),
      },
      slipping,
      teams: teamRows.map(({ cells: _cells, avgScore: _avg, ...rest }) => rest),
      // Heatmap shows EVERY department in the org, even ones with zero
      // activity in this range — so leadership can see who's silent, not
      // just who's contributing.
      teamHeatmap: teamRows.map((r) => ({
        teamId: r.teamId,
        teamName: r.teamName,
        cells: r.cells,
        avgScore: r.avgScore,
      })),
      workload,
      employees: topEmployees,
      summary,
      weekOverWeek: wow,
      // `previous` is retained for wire-format / external-caller compatibility
      // when `compareMode` is explicitly set in the URL. The dashboard UI no
      // longer renders it — week-over-week deltas come from `weekOverWeek`.
      previous: previous
        ? {
            weeks: previous.weeks,
            series: previous.series,
            summary: previous.summary,
            label: previous.label,
          }
        : undefined,
      projects: projectMeta,
      teamOptions: departmentOptions,
      sprintOptions: sprints.map((s) => ({ id: s.id, label: s.name })),
    },
  });
});

interface WeekOverWeekShape {
  /** Has enough data (>= 2 weeks) to compute a real delta. */
  available: boolean;
  /** ISO label of the last (most recent) week — e.g. "Jun 23". */
  thisWeekLabel: string | null;
  /** ISO label of the week before that. */
  lastWeekLabel: string | null;
  /** Last-week absolute values for context display. */
  thisWeek: {
    productivity: number;
    closed: number;
    slipped: number;
  };
  /** Prior-week absolute values. */
  lastWeek: {
    productivity: number;
    closed: number;
    slipped: number;
  };
  /** Deltas (this - prior). For closed/velocity also pre-computed as %. */
  delta: {
    productivity: number;     // percentage-point delta (e.g. +5)
    closedAbs: number;         // absolute count delta
    closedPct: number | null;  // percentage delta vs prior week (null when prior = 0)
    slippedAbs: number;
    delayedPct: number;        // percentage-point delta in delayed-share
  };
}

/**
 * Compute week-over-week deltas from the LAST two weekly buckets of the
 * current range, regardless of how long the range is. This is the dashboard's
 * headline comparison framing — "is the company improving week over week?"
 *
 * If the range has fewer than 2 ISO weeks of data, `available` is false and
 * the KPI cards render "—" for the delta lines.
 */
function computeWeekOverWeek(args: {
  weeks: WeekBucket[];
  productivity: number[];
  created: number[];
  closed: number[];
  slipped: number[];
}): WeekOverWeekShape {
  const { weeks, productivity, closed, slipped } = args;
  const n = weeks.length;
  const empty = {
    available: false,
    thisWeekLabel: n > 0 ? (weeks[n - 1]?.weekLabel ?? null) : null,
    lastWeekLabel: null,
    thisWeek: { productivity: 0, closed: 0, slipped: 0 },
    lastWeek: { productivity: 0, closed: 0, slipped: 0 },
    delta: { productivity: 0, closedAbs: 0, closedPct: null, slippedAbs: 0, delayedPct: 0 },
  } as WeekOverWeekShape;
  if (n < 2) return empty;

  const last = n - 1;
  const prev = n - 2;
  const tw = {
    productivity: productivity[last]!,
    closed: closed[last]!,
    slipped: slipped[last]!,
  };
  const lw = {
    productivity: productivity[prev]!,
    closed: closed[prev]!,
    slipped: slipped[prev]!,
  };
  const createdLast = args.created[last]!;
  const createdPrev = args.created[prev]!;
  const delayedThis = createdLast > 0 ? Math.round((tw.slipped / createdLast) * 100) : 0;
  const delayedPrev = createdPrev > 0 ? Math.round((lw.slipped / createdPrev) * 100) : 0;

  return {
    available: true,
    thisWeekLabel: weeks[last]?.weekLabel ?? null,
    lastWeekLabel: weeks[prev]?.weekLabel ?? null,
    thisWeek: tw,
    lastWeek: lw,
    delta: {
      productivity: tw.productivity - lw.productivity,
      closedAbs: tw.closed - lw.closed,
      closedPct: lw.closed > 0 ? Math.round(((tw.closed - lw.closed) / lw.closed) * 100) : null,
      slippedAbs: tw.slipped - lw.slipped,
      delayedPct: delayedThis - delayedPrev,
    },
  };
}

interface PreviousSeriesShape {
  weeks: WeekBucket[];
  series: { productivity: number[]; created: number[]; closed: number[]; slipped: number[] };
  summary: {
    productivity: number;
    totalCreated: number;
    totalClosed: number;
    totalSlipped: number;
    closedPct: number;
    velocity: number;
    delayedPct: number;
  };
  label: string;
  teamRows?: Array<{ teamId: string; productivity: number }>;
}

async function loadCompareSeries(args: {
  baseIssueWhere: Record<string, unknown>;
  compareRange: ResolvedRange;
}): Promise<PreviousSeriesShape> {
  const { baseIssueWhere, compareRange } = args;
  const buckets = buildWeekBucketsBetween(compareRange.from, compareRange.to);
  const idx = indexByWeek(buckets);

  const [created, closed, slipped] = await Promise.all([
    db.qtIssue.findMany({
      where: { ...baseIssueWhere, createdAt: { gte: compareRange.from, lt: compareRange.to } },
      select: { createdAt: true, eta: true, assigneeId: true },
    }),
    db.qtIssue.findMany({
      where: {
        ...baseIssueWhere,
        updatedAt: { gte: compareRange.from, lt: compareRange.to },
        status: { category: "DONE" },
      },
      select: { updatedAt: true, assigneeId: true },
    }),
    db.qtIssue.findMany({
      where: {
        ...baseIssueWhere,
        dueDate: { gte: compareRange.from, lt: compareRange.to },
        status: { category: { not: "DONE" } },
      },
      select: { dueDate: true, assigneeId: true },
    }),
  ]);

  const len = buckets.length;
  const cSeries = emptyCounts(len);
  const dSeries = emptyCounts(len);
  const sSeries = emptyCounts(len);
  for (const r of created) bumpForDate(cSeries, idx, r.createdAt);
  for (const r of closed) bumpForDate(dSeries, idx, r.updatedAt);
  for (const r of slipped) if (r.dueDate) bumpForDate(sSeries, idx, r.dueDate);

  const productivity = buckets.map((_, i) =>
    calculateProductivity({
      created: cSeries[i]!,
      closed: dSeries[i]!,
      slipped: sSeries[i]!,
      closedOnTime: null,
      estHours: 0,
      actualHours: 0,
    }),
  );

  const totalCreated = sum(cSeries);
  const totalClosed = sum(dSeries);
  const totalSlipped = sum(sSeries);
  return {
    weeks: buckets,
    series: { productivity, created: cSeries, closed: dSeries, slipped: sSeries },
    summary: {
      productivity: calculateProductivity({
        created: totalCreated,
        closed: totalClosed,
        slipped: totalSlipped,
        closedOnTime: null,
        estHours: 0,
        actualHours: 0,
      }),
      totalCreated,
      totalClosed,
      totalSlipped,
      closedPct: totalCreated > 0 ? Math.round((totalClosed / totalCreated) * 100) : 0,
      velocity: averageVelocity(dSeries),
      delayedPct: delayedRate(totalCreated, totalSlipped),
    },
    label: compareRange.label,
  };
}

function parseRangeFromUrl(url: URL, quarterStartMonth: number): ResolvedRange {
  const sp = url.searchParams;
  const legacyWeeks = sp.get("weeksBack");
  if (legacyWeeks && !sp.get("preset") && !sp.get("from")) {
    const w = Math.max(1, Math.min(208, Number(legacyWeeks)));
    return resolveRange("last-90", { quarterStartMonth, ...rollingWeeksOverride(w) });
  }
  const preset = (sp.get("preset") ?? "last-90") as RangePreset;
  const opts: ResolveOptions = {
    quarterStartMonth,
    year: sp.get("year") ? Number(sp.get("year")) : undefined,
    quarter: sp.get("quarter") ? Number(sp.get("quarter")) : undefined,
    month: sp.get("month") ? Number(sp.get("month")) : undefined,
    customFrom: sp.get("from") ?? undefined,
    customTo: sp.get("to") ?? undefined,
  };
  return resolveRange(preset, opts);
}

function rollingWeeksOverride(weeks: number): { customFrom: string; customTo: string } {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
  return {
    customFrom: from.toISOString().slice(0, 10),
    customTo: to.toISOString().slice(0, 10),
  };
}

function pickIssueShape() {
  return {
    id: true,
    projectId: true,
    assigneeId: true,
    createdAt: true,
    updatedAt: true,
    dueDate: true,
    eta: true,
    priority: true,
    status: { select: { category: true, name: true } },
  } as const;
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function nameOf(u: { firstName: string | null; lastName: string | null; email: string }): string {
  const first = u.firstName ?? "";
  const last = u.lastName ?? "";
  const combined = `${first} ${last}`.trim();
  return combined.length > 0 ? combined : u.email;
}

function dedupeDepartmentOptions(
  roles: Array<{ name: string }>,
): Array<{ id: string; label: string }> {
  const m = new Map<string, string>();
  for (const r of roles) {
    const key = r.name.toLowerCase();
    if (!m.has(key)) m.set(key, r.name);
  }
  return Array.from(m.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function emptyResponse(
  range: ResolvedRange,
  teamOptions: Array<{ id: string; label: string }> = [],
) {
  const weeks = buildWeekBucketsBetween(range.from, range.to);
  // Seed teamHeatmap with one empty row per known department so the heatmap
  // still displays the full list when a filter zeroes out activity.
  const teamHeatmap = teamOptions.map((opt) => ({
    teamId: opt.id,
    teamName: opt.label,
    cells: weeks.map((_, idx) => ({
      weekIdx: idx,
      productivity: null,
      created: 0,
      closed: 0,
    })),
    avgScore: 0,
  }));
  const teams = teamOptions.map((opt) => ({
    teamId: opt.id,
    teamName: opt.label,
    productivity: 0,
    delta: null,
    created: 0,
    closed: 0,
  }));
  return {
    range: {
      from: range.from.toISOString().slice(0, 10),
      to: range.to.toISOString().slice(0, 10),
      label: range.label,
    },
    weeks,
    series: {
      productivity: emptyCounts(weeks.length),
      created: emptyCounts(weeks.length),
      closed: emptyCounts(weeks.length),
      slipped: emptyCounts(weeks.length),
      blocked: emptyCounts(weeks.length),
      estHours: emptyCounts(weeks.length),
      actualHours: emptyCounts(weeks.length),
    },
    slipping: weeks.map((w) => ({ weekStart: w.weekStart, weekLabel: w.weekLabel, slipped: 0, blocked: 0 })),
    teams,
    teamHeatmap,
    workload: [],
    employees: [],
    summary: {
      productivity: 0,
      totalCreated: 0,
      totalClosed: 0,
      totalSlipped: 0,
      closedPct: 0,
      velocity: 0,
      delayedPct: 0,
      estHours: 0,
      actualHours: 0,
    },
    weekOverWeek: {
      available: false,
      thisWeekLabel: null,
      lastWeekLabel: null,
      thisWeek: { productivity: 0, closed: 0, slipped: 0 },
      lastWeek: { productivity: 0, closed: 0, slipped: 0 },
      delta: { productivity: 0, closedAbs: 0, closedPct: null, slippedAbs: 0, delayedPct: 0 },
    },
    projects: [],
    teamOptions,
    sprintOptions: [],
  };
}
