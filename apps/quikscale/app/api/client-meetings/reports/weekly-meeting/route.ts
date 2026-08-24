import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { PROMPT_VERSION as WM_PROMPT_VERSION } from "@/lib/ai/prompts/wmProse";
import { WM_SCHEMA_VERSION } from "@/lib/reports/wmCompose";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const querySchema = z.object({
  weeklyMeetingId: z.string().min(1),
});

const validateSchema = z.object({
  weeklyMeetingId: z.string().min(1),
  validated: z.boolean(),
});

/**
 * GET /api/client-meetings/reports/weekly-meeting?weeklyMeetingId=…
 *
 * Returns the saved Weekly Meeting Report, or `report: null` when none exists.
 *
 * **ZERO model calls. ZERO transcript reads. ZERO chunking.** A three-hour
 * meeting costs one extraction and one small analysis pass to GENERATE, and
 * nothing at all to view, however many times it is opened. A test asserts the
 * model mock is never invoked on this path.
 *
 * Staleness is REPORTED, never acted on: a report whose prompt or schema
 * version has moved on is still served, with `stale: true` and the reasons, so
 * the facilitator decides whether spending money is worth it. Auto-regenerating
 * on read is the token bomb doc 17 §L exists to prevent — and it would silently
 * invalidate a sign-off.
 */
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const meeting = await db.clientWeeklyMeeting.findFirst({
    where: { id: parsed.data.weeklyMeetingId, orgId, deletedAt: null },
    select: {
      id: true,
      clientId: true,
      meetingDate: true,
      callStatus: true,
      client: { select: { id: true, name: true } },
    },
  });
  if (!meeting) {
    return NextResponse.json(
      { success: false, error: "Weekly meeting not found" },
      { status: 404 },
    );
  }

  const saved = await db.clientWeeklyMeetingReport.findFirst({
    where: { orgId, weeklyMeetingId: meeting.id, deletedAt: null },
  });

  const canEdit = await userCan(userId, orgId, "ClientMeetings.Report", "update");

  // Version drift only — the source fingerprint needs the full context load, so
  // it is checked at generate time. Reporting what is cheap to know beats
  // making a read path expensive to serve a banner.
  const staleReasons: string[] = [];
  if (saved) {
    if (saved.promptVersion !== WM_PROMPT_VERSION) {
      staleReasons.push("The analysis prompt has changed since this report was generated.");
    }
    if (saved.schemaVersion !== WM_SCHEMA_VERSION) {
      staleReasons.push("The report format has changed since this report was generated.");
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      meeting: {
        id: meeting.id,
        meetingDate: meeting.meetingDate,
        callStatus: meeting.callStatus,
      },
      client: meeting.client,
      report: saved?.report ?? null,
      metrics: saved?.metrics ?? null,
      validation: saved?.validation ?? null,
      confidence: saved?.reportConfidence ?? null,
      completeness: saved?.completeness ?? null,
      coveragePct: saved?.coveragePct ?? null,
      processingLimitations: saved?.processingLimitations ?? null,
      generatedAt: saved?.generatedAt ?? null,
      generatedBy: saved?.generatedBy ?? null,
      validatedAt: saved?.validatedAt ?? null,
      validatedBy: saved?.validatedBy ?? null,
      version: saved?.currentVersion ?? null,
      stale: staleReasons.length > 0,
      staleReasons,
      canEdit,
      canGenerate: canEdit,
      /**
       * A report built from an incomplete reading of the meeting cannot be
       * signed off. Sign-off is a claim about the whole meeting.
       */
      canValidate: canEdit && saved?.completeness === "COMPLETE",
    },
  });
});

/**
 * PUT /api/client-meetings/reports/weekly-meeting
 *
 * Sign-off, and only sign-off. The report body is not editable through this
 * route: every number in it is computed, so an edited figure would no longer
 * match its evidence — regeneration is the way to change a report.
 *
 * A PARTIAL report is refused. `completeness` is set from extraction coverage,
 * so this is the gate that stops "92% of the meeting" being validated as if it
 * were all of it.
 */
export const PUT = auth.update(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => null);
  const parsed = validateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const saved = await db.clientWeeklyMeetingReport.findFirst({
    where: { orgId, weeklyMeetingId: parsed.data.weeklyMeetingId, deletedAt: null },
    select: { id: true, completeness: true, coveragePct: true },
  });
  if (!saved) {
    return NextResponse.json({ success: false, error: "Report not found" }, { status: 404 });
  }

  if (parsed.data.validated && saved.completeness !== "COMPLETE") {
    return NextResponse.json(
      {
        success: false,
        error:
          `This report covers ${saved.coveragePct ?? "an unknown share"}% of the meeting and cannot be signed off. ` +
          "Retry the failed parts of the extraction, then regenerate.",
      },
      { status: 409 },
    );
  }

  const updated = await db.clientWeeklyMeetingReport.update({
    where: { id: saved.id },
    data: {
      validatedAt: parsed.data.validated ? new Date() : null,
      validatedBy: parsed.data.validated ? userId : null,
      updatedBy: userId,
    },
    select: { validatedAt: true, validatedBy: true },
  });

  return NextResponse.json({ success: true, data: updated });
});
