import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("priority");

/**
 * GET /api/priority/[id]/summary — compact Priority projection for AI Runtime.
 *
 * Distinct from GET /api/priority/[id] which returns the full row + every
 * weekly status. This endpoint returns only the fields agents need: identity,
 * ownership, quarter window, current overall status, last 8 weekly statuses,
 * truncated notes, and a deep-link URL.
 *
 * PII: owner_user select is restricted to id/firstName/lastName — email is
 * never read. Deeper PII scrubbing (e.g. of user-authored notes) is the
 * AI Runtime layer's responsibility per v3.0 handoff §7.
 */

const MAX_NOTES_LENGTH = 300;
const WEEKLY_STATUSES_LIMIT = 8;

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const priority = await db.priority.findFirst({
    where: { id: params.id },
    select: {
      id: true,
      orgId: true,
      name: true,
      overallStatus: true,
      quarter: true,
      year: true,
      startWeek: true,
      endWeek: true,
      notes: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
      weeklyStatuses: {
        select: { id: true, priorityId: true, weekNumber: true, status: true, notes: true },
        orderBy: { weekNumber: "desc" },
        take: WEEKLY_STATUSES_LIMIT,
      },
    },
  });

  if (!priority) {
    return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
  }
  if (priority.orgId !== orgId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
  }

  const notes = priority.notes ?? "";
  const lastNotes = notes.length > MAX_NOTES_LENGTH ? notes.slice(0, MAX_NOTES_LENGTH) : notes;

  return NextResponse.json({
    success: true,
    data: {
      id: priority.id,
      name: priority.name,
      status: priority.overallStatus,
      quarter: priority.quarter,
      year: priority.year,
      startWeek: priority.startWeek ?? 0,
      endWeek: priority.endWeek ?? 0,
      weeklyStatuses: priority.weeklyStatuses,
      lastNotes,
      owner_user: priority.owner_user,
      url: `/quikscale/priority/${priority.id}`,
    },
  });
}, { fallbackErrorMessage: "Failed to fetch Priority summary" });
