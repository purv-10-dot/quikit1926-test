import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { userCanInProject, hasAdminAccess, forbidden } from "@/lib/api/permissions";

/**
 * Copy the caller's PREVIOUS week of timesheet entries into the week they're
 * viewing, mapped weekday→weekday (last Mon → this Mon, …). Only days up to
 * and including TODAY are filled (future days stay empty), and a (issue, day)
 * that already has an entry this week is skipped — so re-running later in the
 * week tops up the newly-elapsed days without duplicating.
 *
 * It's a COPY: the previous week's entries are untouched.
 */

const bodySchema = z.object({
  weekStart: z.string().datetime(),
  weekEnd: z.string().datetime(),
  projectId: z.string().min(1).nullable().optional(),
  // Dry run: compute the counts (what would copy / be skipped) without writing,
  // so the confirm dialog can show a comparison first.
  preview: z.boolean().optional(),
});

/** YYYY-MM-DD key for dedupe, ignoring time-of-day. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Create one entry and roll it into the weekly summary (mirrors POST /timesheets). */
async function createEntryWithRollup(args: {
  orgId: string;
  userId: string;
  projectId: string;
  issueId: string;
  parentIssueId: string | null;
  entryDate: Date;
  hours: number;
  description: string | null;
}): Promise<void> {
  const { orgId, userId, projectId, issueId, parentIssueId, entryDate, hours, description } = args;
  await db.qtTimesheetEntry.create({
    data: {
      orgId,
      userId,
      projectId,
      issueId,
      parentIssueId,
      entryDate,
      hours,
      description,
      createdBy: userId,
      updatedBy: userId,
    },
  });
  const startOfYear = new Date(entryDate.getFullYear(), 0, 1);
  const week = Math.ceil(
    (((entryDate.getTime() - startOfYear.getTime()) / 86_400_000) + startOfYear.getDay() + 1) / 7,
  );
  const summary = await db.qtTimesheetWeeklySummary.findFirst({
    where: { issueId, userId, year: entryDate.getFullYear(), weekNumber: week },
    select: { id: true, totalHours: true },
  });
  if (summary) {
    await db.qtTimesheetWeeklySummary.update({
      where: { id: summary.id },
      data: { totalHours: summary.totalHours + hours },
    });
  } else {
    await db.qtTimesheetWeeklySummary.create({
      data: { orgId, issueId, userId, year: entryDate.getFullYear(), weekNumber: week, totalHours: hours },
    });
  }
}

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  // The client may pass a project KEY (readable URLs) or a cuid. Resolve to the
  // real id, org-scoped, so the projectId filter matches stored entries. Null =
  // "all projects" (no filter), left as-is.
  const projectIdOrKey = parsed.data.projectId ?? null;
  let projectId: string | null = null;
  if (projectIdOrKey) {
    const project = await db.qtProject.findFirst({
      where: {
        orgId,
        isDeleted: false,
        OR: [{ id: projectIdOrKey }, { projectKey: projectIdOrKey }],
      },
      select: { id: true },
    });
    projectId = project?.id ?? projectIdOrKey; // fall back to raw if unresolved
  }
  const weekStart = new Date(parsed.data.weekStart);
  const weekEnd = new Date(parsed.data.weekEnd);

  // The source week is the one immediately before the viewed week.
  const prevStart = new Date(weekStart);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(weekEnd);
  prevEnd.setDate(prevEnd.getDate() - 7);

  const prev = await db.qtTimesheetEntry.findMany({
    where: {
      orgId,
      userId,
      isDeleted: false,
      ...(projectId ? { projectId } : {}),
      entryDate: { gte: prevStart, lte: prevEnd },
    },
    select: {
      projectId: true,
      issueId: true,
      parentIssueId: true,
      entryDate: true,
      hours: true,
      description: true,
    },
    orderBy: { entryDate: "asc" },
  });
  if (prev.length === 0) {
    return NextResponse.json({
      success: true,
      data: { created: 0, skippedFuture: 0, skippedExisting: 0 },
    });
  }

  // Permission: the user must be able to log time in each project involved.
  const isAdmin = await hasAdminAccess(userId, orgId);
  const projectIds = Array.from(new Set(prev.map((p) => p.projectId)));
  const allowed = new Set<string>();
  for (const pid of projectIds) {
    if (isAdmin || (await userCanInProject(userId, orgId, pid, "Timesheet", "create"))) {
      allowed.add(pid);
    }
  }
  if (allowed.size === 0) return forbidden();

  // Only fill days up to (and including) today.
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Existing entries this week → don't duplicate a (issue, day). Also sum their
  // hours per (issue, day) so the preview can show what's already logged.
  const existing = await db.qtTimesheetEntry.findMany({
    where: {
      orgId,
      userId,
      isDeleted: false,
      ...(projectId ? { projectId } : {}),
      entryDate: { gte: weekStart, lte: weekEnd },
    },
    select: { issueId: true, entryDate: true, hours: true },
  });
  const seen = new Set(existing.map((e) => `${e.issueId}|${dayKey(e.entryDate)}`));
  const existingHoursByKey = new Map<string, number>();
  for (const e of existing) {
    const k = `${e.issueId}|${dayKey(e.entryDate)}`;
    existingHoursByKey.set(k, (existingHoursByKey.get(k) ?? 0) + e.hours);
  }

  // In preview mode we also collect a per-entry breakdown so the confirm modal
  // can show a comparison table (which task, which day, how long, what happens).
  const wantDetails = parsed.data.preview === true;
  type Row = {
    issueId: string;
    hours: number;
    source: Date;
    target: Date;
    status: "copy" | "existing" | "future";
  };
  const rows: Row[] = [];

  // Collapse multiple last-week entries on the same (task, day) into ONE logical
  // entry carrying the day's TOTAL hours (and merged descriptions). The grid
  // shows a day's work as a single cell total, so the copy mirrors that instead
  // of recreating granular fragments.
  type Grouped = {
    projectId: string;
    issueId: string;
    parentIssueId: string | null;
    entryDate: Date;
    hours: number;
    description: string | null;
  };
  const groupedMap = new Map<string, Grouped>();
  for (const e of prev) {
    const k = `${e.issueId}|${dayKey(e.entryDate)}`;
    const g = groupedMap.get(k);
    if (g) {
      g.hours += e.hours;
      if (e.description) {
        const parts = g.description ? g.description.split("; ") : [];
        if (!parts.includes(e.description)) {
          g.description = [...parts, e.description].join("; ");
        }
      }
    } else {
      groupedMap.set(k, {
        projectId: e.projectId,
        issueId: e.issueId,
        parentIssueId: e.parentIssueId,
        entryDate: new Date(e.entryDate),
        hours: e.hours,
        description: e.description,
      });
    }
  }
  const groupedPrev = Array.from(groupedMap.values());

  let created = 0;
  let skippedFuture = 0;
  let skippedExisting = 0;
  for (const e of groupedPrev) {
    if (!allowed.has(e.projectId)) continue;
    const target = new Date(e.entryDate);
    target.setDate(target.getDate() + 7);
    const source = new Date(e.entryDate);
    if (target.getTime() > endOfToday.getTime()) {
      skippedFuture++;
      if (wantDetails) rows.push({ issueId: e.issueId, hours: e.hours, source, target, status: "future" });
      continue;
    }
    const key = `${e.issueId}|${dayKey(target)}`;
    if (seen.has(key)) {
      skippedExisting++;
      if (wantDetails) rows.push({ issueId: e.issueId, hours: e.hours, source, target, status: "existing" });
      continue;
    }
    seen.add(key);
    // Preview = dry run: count what would copy, but don't write anything.
    if (!parsed.data.preview) {
      await createEntryWithRollup({
        orgId,
        userId,
        projectId: e.projectId,
        issueId: e.issueId,
        parentIssueId: e.parentIssueId,
        entryDate: target,
        hours: e.hours,
        description: e.description,
      });
    } else {
      rows.push({ issueId: e.issueId, hours: e.hours, source, target, status: "copy" });
    }
    created++;
  }

  // Resolve issue key/title for the preview rows (one query) and serialize.
  let details:
    | Array<{
        issueKey: string;
        issueTitle: string;
        weekday: string;
        sourceDate: string;
        targetDate: string;
        lastWeekHours: number; // hours logged last week (what would copy)
        thisWeekHours: number; // hours already logged this week on that day (0 if none)
        status: "copy" | "existing" | "future";
      }>
    | undefined;
  if (wantDetails) {
    const ids = Array.from(new Set(rows.map((r) => r.issueId)));
    const issues = ids.length
      ? await db.qtIssue.findMany({ where: { id: { in: ids }, orgId }, select: { id: true, key: true, title: true } })
      : [];
    const byId = new Map(issues.map((i) => [i.id, i] as const));
    const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    details = rows
      .slice()
      .sort((a, b) => a.target.getTime() - b.target.getTime())
      .map((r) => ({
        issueKey: byId.get(r.issueId)?.key ?? "",
        issueTitle: byId.get(r.issueId)?.title ?? "Untitled",
        weekday: WD[r.target.getDay()] ?? "",
        sourceDate: r.source.toISOString(),
        targetDate: r.target.toISOString(),
        lastWeekHours: r.hours,
        thisWeekHours: existingHoursByKey.get(`${r.issueId}|${dayKey(r.target)}`) ?? 0,
        status: r.status,
      }));
  }

  return NextResponse.json({
    success: true,
    data: { created, skippedFuture, skippedExisting, ...(details ? { details } : {}) },
  });
});
