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
  const projectId = parsed.data.projectId ?? null;
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

  // Existing entries this week → don't duplicate a (issue, day).
  const existing = await db.qtTimesheetEntry.findMany({
    where: {
      orgId,
      userId,
      isDeleted: false,
      ...(projectId ? { projectId } : {}),
      entryDate: { gte: weekStart, lte: weekEnd },
    },
    select: { issueId: true, entryDate: true },
  });
  const seen = new Set(existing.map((e) => `${e.issueId}|${dayKey(e.entryDate)}`));

  let created = 0;
  let skippedFuture = 0;
  let skippedExisting = 0;
  for (const e of prev) {
    if (!allowed.has(e.projectId)) continue;
    const target = new Date(e.entryDate);
    target.setDate(target.getDate() + 7);
    if (target.getTime() > endOfToday.getTime()) {
      skippedFuture++;
      continue;
    }
    const key = `${e.issueId}|${dayKey(target)}`;
    if (seen.has(key)) {
      skippedExisting++;
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
    }
    created++;
  }

  return NextResponse.json({ success: true, data: { created, skippedFuture, skippedExisting } });
});
