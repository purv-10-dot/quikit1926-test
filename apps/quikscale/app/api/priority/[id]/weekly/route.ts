import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { weeklyStatusSchema } from "@/lib/schemas/prioritySchema";
import { getPastWeekFlags, getWeekGateFromDB } from "@/lib/utils/featureFlags";
import { weekEditState, isWeeklyWriteAllowed, earliestEditableWeek } from "@/lib/utils/weekLock";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { audit, requestContext } from "@/lib/audit";
const withOrgAuth = withOrgAuthForModule("priority");

// POST /api/priority/[id]/weekly — upsert a weekly status
export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, request, { params }) => {
    const priority = await db.priority.findFirst({
      where: { id: params.id, orgId },
      select: { quarter: true, year: true, teamId: true },
    });
    if (!priority) {
      return NextResponse.json(
        { success: false, error: "Priority not found" },
        { status: 404 },
      );
    }

    const parsed = weeklyStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 },
      );
    }
    const { weekNumber, status, notes } = parsed.data;

    // ── Quarter-aware past/future edit enforcement ──
    // Future quarters/weeks are always rejected; a past quarter is rejected
    // unless edit-past is on; in the current quarter, weeks before the editable
    // window (current week minus grace) are rejected — the grace keeps the
    // immediately-previous week editable. EXCEPTION: a future week in the
    // current quarter may be set to "completed" (the inline Completed cascade
    // POSTs each forward week here) — see `isWeeklyWriteAllowed`.
    const { canEditPastWeek } = await getPastWeekFlags(orgId);
    if (priority.quarter && priority.year) {
      const { currentWeek, quarterPosition } = await getWeekGateFromDB(orgId, priority.year, priority.quarter);
      const gate = weekEditState({ quarterPosition, week: weekNumber, currentWeek, canEditPastWeek, flagsLoaded: true });
      if (!isWeeklyWriteAllowed({ quarterPosition, week: weekNumber, currentWeek, canEditPastWeek, flagsLoaded: true, status: String(status) })) {
        const error = gate.isFuture
          ? `Week ${weekNumber} is in the future and can't be updated yet.`
          : quarterPosition === "past"
            ? `Editing past quarters is disabled. Enable it in Settings > Configurations.`
            : `Editing past weeks is disabled. Week ${weekNumber} is before the earliest editable week (${earliestEditableWeek(currentWeek, canEditPastWeek)}). Enable it in Settings > Configurations.`;
        return NextResponse.json({ success: false, error }, { status: 403 });
      }
    }

    // Snapshot the prior status + notes for this week so the audit captures
    // old → new AND so we can skip logging a no-op save (re-clicking the same
    // status, or an autosave that didn't change anything).
    const prior = await db.priorityWeeklyStatus.findUnique({
      where: { priorityId_weekNumber: { priorityId: params.id, weekNumber } },
      select: { status: true, notes: true },
    });
    const previousStatus = prior?.status ?? null;
    const normNotes = (s: string | null | undefined) => (s == null || s === "" ? null : s);

    const record = await db.priorityWeeklyStatus.upsert({
      where: {
        priorityId_weekNumber: { priorityId: params.id, weekNumber },
      },
      update: {
        status: String(status),
        notes: notes ?? null,
        updatedBy: userId,
      },
      create: {
        priorityId: params.id,
        weekNumber,
        status: String(status),
        notes: notes ?? null,
        updatedBy: userId,
      },
      select: {
        id: true,
        priorityId: true,
        weekNumber: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // ── Centralized audit ── one WEEKLY_UPDATE event per *meaningful* week edit.
    // Skip no-op saves (same status AND same notes) so re-clicking the current
    // status or an autosave that changed nothing doesn't litter the timeline
    // with duplicate entries. Notes-only edits are still logged.
    const newStatus = String(status);
    const statusChanged = previousStatus !== newStatus;
    const notesChanged = normNotes(prior?.notes) !== normNotes(notes);
    if (statusChanged || notesChanged) {
      await audit.log({
        entityType: "PRIORITY",
        entityId: params.id,
        action: "WEEKLY_UPDATE",
        actor: { userId, orgId, teamId: priority.teamId },
        changes: statusChanged
          ? [{ fieldName: `week_${weekNumber}`, oldValue: previousStatus, newValue: newStatus }]
          : [],
        snapshot: {
          weekNumber,
          status: newStatus,
          previousStatus,
          notes: notes ?? null,
          // Prior note so the timeline can show old → new note (not just the
          // new value). Older events without this render the new note only.
          previousNotes: prior?.notes ?? null,
          notesOnly: !statusChanged && notesChanged,
          kind: "status",
        },
        ...requestContext(request),
      });
    }

    return NextResponse.json({ success: true, data: record });
  },
  { fallbackErrorMessage: "Failed to update weekly status" },
);
