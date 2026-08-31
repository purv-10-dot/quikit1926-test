import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/**
 * DELETE /api/client-meetings/transcripts/[id]
 *
 * Soft-delete one meeting transcript — the row keeps its `rawText`, its
 * extracted facts and any generated report, and simply stops being listed.
 *
 * SOFT, deliberately. A transcript is the evidence every downstream number is
 * traceable to: the daily report quotes it, the weekly rollup aggregates those
 * reports, and the monthly report trends the rollups. Hard-deleting one would
 * leave signed-off reports citing evidence that no longer exists, and re-import
 * from Fathom is not always possible. `deletedAt` removes it from every read
 * path (all of them already filter `deletedAt: null`) while keeping the audit
 * trail whole and a restore route cheap to add later.
 *
 * PERMISSION — `ClientMeetings.Report: delete`.
 *
 * Body (optional): `{ reason?: string }` — shown in the audit timeline.
 */
export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  const existing = await db.clientMeetingTranscript.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: {
      id: true,
      clientId: true,
      title: true,
      type: true,
      meetingDate: true,
      report: true,
      client: { select: { name: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Transcript not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  await db.clientMeetingTranscript.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  });

  const dateLabel = existing.meetingDate ? existing.meetingDate.toISOString().slice(0, 10) : "—";
  const label = existing.title ?? `${existing.client?.name ?? "Unassigned"} · ${dateLabel}`;

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "DELETE",
    entityType: "MeetingTranscript",
    entityId: existing.id,
    oldValues: {
      clientId: existing.clientId,
      type: existing.type,
      meetingDate: dateLabel,
      title: existing.title,
      hadReport: Boolean(existing.report),
    },
    reason: reason ?? undefined,
  });

  // Centralized audit (dual-write) — friendly identity so the timeline shows
  // which recording was removed, not just an id.
  await audit.log({
    entityType: "MEETING_TRANSCRIPT",
    entityId: existing.id,
    action: "DELETE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: {
      name: label,
      clientId: existing.clientId,
      meetingDate: dateLabel,
      hadReport: Boolean(existing.report),
    },
    ...requestContext(request),
  });

  return NextResponse.json({ success: true, data: { id: existing.id, hadReport: Boolean(existing.report) } });
});
