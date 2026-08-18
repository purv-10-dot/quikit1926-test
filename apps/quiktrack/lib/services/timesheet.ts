import { db } from "@/lib/db";

/** Thrown by {@link createTimesheetEntry} when `entryDate` is more than 24h
 *  in the future — the same rule the Timesheets REST route enforces. */
export class TimesheetFutureDateError extends Error {}

export interface CreateTimesheetEntryInput {
  orgId: string;
  userId: string;
  projectId: string;
  issueId: string;
  parentIssueId: string | null;
  entryDate: Date;
  hours: number;
  description?: string;
  createdBy: string;
}

/**
 * Creates a timesheet entry and rolls it into the issue's weekly summary.
 * Shared by the `/api/timesheets` REST route and the MCP `add_worklog` tool
 * so both paths update the weekly rollup identically.
 */
export async function createTimesheetEntry(input: CreateTimesheetEntryInput) {
  const { orgId, userId, projectId, issueId, parentIssueId, entryDate, hours, description, createdBy } = input;

  if (entryDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw new TimesheetFutureDateError("Cannot log time in the future");
  }

  const entry = await db.qtTimesheetEntry.create({
    data: {
      orgId,
      userId,
      projectId,
      issueId,
      parentIssueId,
      entryDate,
      hours,
      description,
      createdBy,
      updatedBy: createdBy,
    },
  });

  // Roll-up weekly summary (best-effort, non-blocking would be a future improvement).
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

  return entry;
}

export interface WorklogAuthor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar: string | null;
}

export interface WorklogEntryDto {
  id: string;
  timeSpentSeconds: number;
  started: Date;
  comment: string | null;
  author: WorklogAuthor | null;
}

/** Chronological worklog entries for one issue, with the logger resolved
 *  (QtTimesheetEntry has no User relation, so this joins manually — same
 *  pattern as the `/api/timesheets` and `/api/reports/task-time` routes). */
export async function listWorklogsForIssue(opts: {
  orgId: string;
  projectId: string;
  issueId: string;
}): Promise<WorklogEntryDto[]> {
  const entries = await db.qtTimesheetEntry.findMany({
    where: { orgId: opts.orgId, projectId: opts.projectId, issueId: opts.issueId, isDeleted: false },
    orderBy: { entryDate: "asc" },
  });
  const userIds = Array.from(new Set(entries.map((e) => e.userId)));
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u] as const));
  return entries.map((e) => ({
    id: e.id,
    timeSpentSeconds: Math.round(e.hours * 3600),
    started: e.entryDate,
    comment: e.description ?? null,
    author: userById.get(e.userId) ?? null,
  }));
}
