import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { weeklyStatusSchema } from "@/lib/schemas/prioritySchema";
import {
  getPastWeekFlags,
  getCurrentFiscalWeekFromDB,
} from "@/lib/utils/featureFlags";
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

    // ── Past-week edit enforcement ──
    const { canEditPastWeek } = await getPastWeekFlags(orgId);
    if (!canEditPastWeek && priority.quarter && priority.year) {
      const currentWeek = await getCurrentFiscalWeekFromDB(
        orgId,
        priority.year,
        priority.quarter,
      );
      if (weekNumber < currentWeek) {
        return NextResponse.json(
          {
            success: false,
            error: `Editing past weeks is disabled. Week ${weekNumber} is before the current week (${currentWeek}). Enable it in Settings > Configurations.`,
          },
          { status: 403 },
        );
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
