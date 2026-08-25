import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { storedMeetingReportSchema } from "@/lib/ai/meetingReport";
import { audit, requestContext } from "@/lib/audit";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/**
 * GET /api/client-meetings/transcripts/[id]/report
 *
 * Return the saved report for a transcript (or `report: null` if none saved
 * yet), plus `canEdit` so the viewer knows whether to expose editing + Save.
 * Requires `ClientMeetings.Report` view.
 */
export const GET = auth.view<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const t = await db.clientMeetingTranscript.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: {
      report: true,
      reportConfidence: true,
      reportGeneratedAt: true,
      reportGeneratedBy: true,
      reportUpdatedAt: true,
      reportUpdatedBy: true,
    },
  });
  if (!t) {
    return NextResponse.json({ success: false, error: "Transcript not found" }, { status: 404 });
  }

  const canEdit = await userCan(userId, orgId, "ClientMeetings.Report", "update");
  return NextResponse.json({
    success: true,
    data: {
      report: t.report ?? null,
      confidence: t.reportConfidence,
      generatedAt: t.reportGeneratedAt,
      generatedBy: t.reportGeneratedBy,
      updatedAt: t.reportUpdatedAt,
      updatedBy: t.reportUpdatedBy,
      canEdit,
    },
  });
});

/**
 * PUT /api/client-meetings/transcripts/[id]/report
 *
 * Persist a (possibly edited) report. This is the "Edit Report" gate —
 * requires `ClientMeetings.Report` update. Body: `{ report: StoredMeetingReport }`.
 * Creating the accepted KPI/Priority/WWW records happens separately via the
 * existing POST routes (so their own permissions + dedup + audit apply); this
 * route only stores the report document, including the `createdRecordId`
 * annotations the client sets on items it created.
 */
export const PUT = auth.update<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const body = (await req.json().catch(() => null)) as { report?: unknown } | null;
  const parsed = storedMeetingReportSchema.safeParse(body?.report);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid report" },
      { status: 400 },
    );
  }
  const report = parsed.data;

  const existing = await db.clientMeetingTranscript.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true, reportGeneratedAt: true, reportGeneratedBy: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Transcript not found" }, { status: 404 });
  }

  const now = new Date();
  await db.clientMeetingTranscript.update({
    where: { id: existing.id },
    data: {
      report: report as unknown as Prisma.InputJsonValue,
      reportConfidence: report.overallConfidence,
      // Stamp generated-by on first save; preserve it thereafter.
      reportGeneratedAt: existing.reportGeneratedAt ?? now,
      reportGeneratedBy: existing.reportGeneratedBy ?? userId,
      reportUpdatedAt: now,
      reportUpdatedBy: userId,
    },
  });

  return NextResponse.json({ success: true, data: { report } });
});

/**
 * DELETE /api/client-meetings/transcripts/[id]/report
 *
 * Discard the generated report for a transcript, keeping the transcript itself.
 * The report columns are cleared (`report`, confidence, generated/updated
 * stamps) so the viewer falls back to "not generated yet" and the report can be
 * regenerated from scratch.
 *
 * Deliberately does NOT touch extracted facts or segments — those are the
 * expensive part of the pipeline and are reusable; only the composed document
 * is thrown away. Any KPI / Priority / WWW records already created from this
 * report are real records with their own lifecycle and are left alone.
 *
 * PERMISSION — `ClientMeetings.Report: delete`.
 */
export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const existing = await db.clientMeetingTranscript.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: {
      id: true,
      clientId: true,
      title: true,
      meetingDate: true,
      report: true,
      reportConfidence: true,
      client: { select: { name: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Transcript not found" }, { status: 404 });
  }
  if (!existing.report) {
    return NextResponse.json(
      { success: false, error: "No report to delete for this transcript." },
      { status: 404 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown } | null;
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  await db.clientMeetingTranscript.update({
    where: { id: existing.id },
    data: {
      report: Prisma.DbNull,
      reportConfidence: null,
      reportGeneratedAt: null,
      reportGeneratedBy: null,
      reportUpdatedAt: new Date(),
      reportUpdatedBy: userId,
    },
  });

  const dateLabel = existing.meetingDate ? existing.meetingDate.toISOString().slice(0, 10) : "—";
  await audit.log({
    entityType: "MEETING_REPORT",
    entityId: existing.id,
    action: "DELETE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: {
      name: `Daily report · ${existing.client?.name ?? "Unassigned"} · ${dateLabel}`,
      reportType: "DAILY",
      transcriptId: existing.id,
      clientId: existing.clientId,
      confidence: existing.reportConfidence,
    },
    ...requestContext(req),
  });

  return NextResponse.json({ success: true, data: { id: existing.id } });
});
