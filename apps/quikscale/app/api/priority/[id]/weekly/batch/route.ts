import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { weeklyStatusBatchSchema } from "@/lib/schemas/prioritySchema";
import {
  getPastWeekFlags,
  getCurrentFiscalWeekFromDB,
} from "@/lib/utils/featureFlags";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { audit, requestContext } from "@/lib/audit";
import { publishRealtime } from "@quikit/realtime/server";
const withOrgAuth = withOrgAuthForModule("priority");

const normNotes = (s: string | null | undefined) => (s == null || s === "" ? null : s);

// POST /api/priority/[id]/weekly/batch — upsert MANY weekly statuses in one save.
//
// Mirrors the KPI weekly batch route's audit taxonomy so the change history
// stays consistent across modules:
//   • ≥ 3 DISTINCT changed weeks → ONE BULK_UPDATE event (purple "Bulk weekly
//     update · weeks N–M" card). Used by the Completed cascade, which can touch
//     many weeks in a single user action.
//   • < 3 changed weeks → one WEEKLY_UPDATE event PER changed week, with the
//     SAME snapshot shape the single-week route writes — so a 1- or 2-week save
//     renders identically to today.
// No-op weeks (status AND notes unchanged) are applied idempotently but never
// logged, matching the single-week route.
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

    const parsed = weeklyStatusBatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    // De-dupe by weekNumber (last write wins) so a malformed client payload
    // can't double-apply or inflate the "weeks" list.
    const inputsByWeek = new Map<number, { weekNumber: number; status: string; notes?: string | null }>();
    for (const inp of parsed.data.inputs) inputsByWeek.set(inp.weekNumber, inp);
    const inputs = [...inputsByWeek.values()];

    // ── Past-week edit enforcement ── (same rule as the single-week route).
    const { canEditPastWeek } = await getPastWeekFlags(orgId);
    if (!canEditPastWeek && priority.quarter && priority.year) {
      const currentWeek = await getCurrentFiscalWeekFromDB(
        orgId,
        priority.year,
        priority.quarter,
      );
      const offending = inputs.find((i) => i.weekNumber < currentWeek);
      if (offending) {
        return NextResponse.json(
          {
            success: false,
            error: `Editing past weeks is disabled. Week ${offending.weekNumber} is before the current week (${currentWeek}). Enable it in Settings > Configurations.`,
          },
          { status: 403 },
        );
      }
    }

    // Snapshot prior status/notes for every touched week up front (one query)
    // so we can compute old → new and skip no-op saves.
    const weeks = inputs.map((i) => i.weekNumber);
    const priorRows = await db.priorityWeeklyStatus.findMany({
      where: { priorityId: params.id, weekNumber: { in: weeks } },
      select: { weekNumber: true, status: true, notes: true },
    });
    const priorMap = new Map(priorRows.map((r) => [r.weekNumber, { status: r.status, notes: r.notes }]));

    // Apply every upsert, recording which weeks actually changed.
    type Applied = {
      weekNumber: number;
      oldStatus: string | null;
      newStatus: string;
      note: string | null;
      oldNote: string | null;
      statusChanged: boolean;
      notesChanged: boolean;
    };
    const appliedChanges: Applied[] = [];
    for (const inp of inputs) {
      const newStatus = String(inp.status);
      const prior = priorMap.get(inp.weekNumber);
      const previousStatus = prior?.status ?? null;
      const statusChanged = previousStatus !== newStatus;
      const notesChanged = normNotes(prior?.notes) !== normNotes(inp.notes);

      await db.priorityWeeklyStatus.upsert({
        where: { priorityId_weekNumber: { priorityId: params.id, weekNumber: inp.weekNumber } },
        update: { status: newStatus, notes: inp.notes ?? null, updatedBy: userId },
        create: {
          priorityId: params.id,
          weekNumber: inp.weekNumber,
          status: newStatus,
          notes: inp.notes ?? null,
          updatedBy: userId,
        },
      });

      if (statusChanged || notesChanged) {
        appliedChanges.push({
          weekNumber: inp.weekNumber,
          oldStatus: previousStatus,
          newStatus,
          note: inp.notes ?? null,
          oldNote: prior?.notes ?? null,
          statusChanged,
          notesChanged,
        });
      }
    }

    // ── Centralized audit ── classify by distinct CHANGED weeks.
    const WEEKLY_BULK_THRESHOLD = 3;
    const applied = appliedChanges.length;
    const failed = 0;
    if (applied > 0) {
      const sortedWeeks = [...new Set(appliedChanges.map((c) => c.weekNumber))].sort((a, b) => a - b);

      if (sortedWeeks.length >= WEEKLY_BULK_THRESHOLD) {
        await audit.log({
          entityType: "PRIORITY",
          entityId: params.id,
          action: "BULK_UPDATE",
          actor: { userId, orgId, teamId: priority.teamId },
          // Only status changes carry a field diff; notes-only weeks contribute
          // to the card's row table but not the changes list.
          changes: appliedChanges
            .filter((c) => c.statusChanged)
            .map((c) => ({
              fieldName: `week_${c.weekNumber}`,
              oldValue: c.oldStatus,
              newValue: c.newStatus,
            })),
          snapshot: {
            applied,
            failed,
            weeks: sortedWeeks,
            kind: "status",
            rows: appliedChanges.map((c) => ({
              weekNumber: c.weekNumber,
              oldStatus: c.oldStatus,
              newStatus: c.newStatus,
              note: c.note,
              oldNote: c.oldNote,
            })),
          },
          ...requestContext(request),
        });
      } else {
        // 1–2 changed weeks → individual WEEKLY_UPDATE events with the EXACT
        // snapshot shape the single-week route writes, so the cards match.
        for (const c of appliedChanges) {
          await audit.log({
            entityType: "PRIORITY",
            entityId: params.id,
            action: "WEEKLY_UPDATE",
            actor: { userId, orgId, teamId: priority.teamId },
            changes: c.statusChanged
              ? [{ fieldName: `week_${c.weekNumber}`, oldValue: c.oldStatus, newValue: c.newStatus }]
              : [],
            snapshot: {
              weekNumber: c.weekNumber,
              status: c.newStatus,
              previousStatus: c.oldStatus,
              notes: c.note,
              previousNotes: c.oldNote,
              notesOnly: !c.statusChanged && c.notesChanged,
              kind: "status",
            },
            ...requestContext(request),
          });
        }
      }
    }

    if (applied > 0) {
      await publishRealtime({
        entity: "priority",
        action: "updated",
        id: params.id,
        orgId,
        teamId: priority.teamId,
        year: priority.year ?? undefined,
        quarter: priority.quarter ?? undefined,
        actorUserId: userId,
      });
    }

    return NextResponse.json({ success: true, data: { applied, failed, weeks } });
  },
  { fallbackErrorMessage: "Failed to update weekly statuses" },
);
