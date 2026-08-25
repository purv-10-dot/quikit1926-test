import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { GeminiUnavailableError } from "@/lib/ai/geminiKeyPool";
import {
  generateMeetingReport,
  MeetingReportError,
  type ReportTranscriptInput,
  type StoredMeetingReport,
} from "@/lib/ai/meetingReport";
import {
  generateWeeklyReportProse,
  WeeklyReportError,
  type ParticipantDayNote,
} from "@/lib/ai/weeklyHuddleReport";
import {
  buildMetricsSnapshot,
  buildWeeklyFactSet,
  composeWeeklyReport,
  computeDeterministicWeek,
} from "@/lib/ai/weeklyHuddleCompose";
import {
  computeWeeklyCacheState,
  DH_WEEKLY_SCHEMA_VERSION,
} from "@/lib/reports/weeklyCacheState";
import { snapshotReportVersion } from "@/lib/reports/versions";
import { scopeKeyFor, upsertReport } from "@/lib/reports/reportStore";
import { validateWeeklyReport } from "@/lib/ai/weeklyReportValidation";
import { loadWeekContext, toWeekStart, weekLabel } from "@/lib/services/weeklyHuddleData";

export const runtime = "nodejs";
// Up to five daily generations plus the weekly pass — well beyond the default.
export const maxDuration = 300;

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/** This route only ever writes one kind of row in the shared report table. */
const KIND = "DH_WEEKLY" as const;

/** Hard ceiling on daily reports generated in one request. */
const MAX_BACKFILL = 7;

const bodySchema = z.object({
  clientId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be yyyy-mm-dd"),
  /**
   * The user's checklist selection, as yyyy-mm-dd dates. Omitted ⇒ every day
   * in the week. Keyed by date rather than huddle id because a day known only
   * from a transcript has no huddle record to reference.
   */
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  /** Generate reports for days that don't have one yet. Default true. */
  backfillMissing: z.boolean().optional(),
});

/**
 * POST /api/client-meetings/reports/weekly/generate
 *
 * Build and persist the Daily Huddle Weekly Report for one client-week.
 *
 * Pipeline:
 *   1. Load the week's huddles, roster and saved daily reports.
 *   2. Backfill: for selected days with a transcript but no saved report,
 *      generate one. It is PERSISTED when the caller also holds
 *      `ClientMeetings.Report` update; otherwise it is used in-memory only and
 *      reported in `notes` — generating is never silently destructive.
 *   3. Compute §4.1–§4.5A deterministically (no AI).
 *   4. One AI pass for prose only, over the computed tables.
 *   5. Validate, compose, and upsert.
 *
 * Responses (all 200 unless noted):
 *   { report, metrics, validation, … } — success
 *   { aiUnavailable: true }            — every Gemini key failed
 *   { reportError: string }            — model output unparseable
 *   { noData: true, sources }          — nothing to aggregate
 *
 * PERMISSION — `ClientMeetings.Report: update`, not `view` (doc 17 D14).
 *   Generating spends money on the model AND overwrites the stored row for the
 *   week, clearing any facilitator sign-off. Both are writes in every sense
 *   that matters, so gating them on read access was wrong: a view-only user
 *   could run up cost and destroy a validated report. Viewing the result stays
 *   on `view`, via the sibling GET route, which never calls the model.
 */
export const POST = auth.update(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { clientId, dates, backfillMissing = true } = parsed.data;
  const weekStart = toWeekStart(new Date(`${parsed.data.weekStart}T00:00:00.000Z`));

  const initial = await loadWeekContext(orgId, clientId, weekStart, { includeDates: dates });
  if (!initial) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }
  if (!initial.days.length) {
    return NextResponse.json({
      success: true,
      data: { noData: true, sources: initial.sources },
    });
  }

  const notes: string[] = [];
  // The route itself now requires Report:update (D14), so anyone reaching this
  // line can persist backfilled daily reports. Kept as a named constant rather
  // than inlined so the backfill logic below reads unchanged and the intent
  // stays explicit at its call sites.
  const canSaveDaily = true;

  // --- 2. Backfill missing daily reports ------------------------------------
  const overrideReports = new Map<string, StoredMeetingReport>();
  if (backfillMissing) {
    const selected = dates?.length ? new Set(dates) : null;
    const missing = initial.sources.filter(
      (s) => s.transcriptId && !s.hasReport && (!selected || selected.has(s.date)),
    );

    if (missing.length > MAX_BACKFILL) {
      notes.push(`Only the first ${MAX_BACKFILL} missing daily reports were generated.`);
    }

    for (const source of missing.slice(0, MAX_BACKFILL)) {
      const t = await db.clientMeetingTranscript.findFirst({
        where: { id: source.transcriptId!, orgId, deletedAt: null },
        select: {
          type: true,
          title: true,
          meetingDate: true,
          durationMinutes: true,
          attendees: true,
          summary: true,
          actionItems: true,
          rawText: true,
          client: { select: { name: true } },
        },
      });
      if (!t) continue;

      const input: ReportTranscriptInput = {
        type: t.type ?? "DAILY",
        title: t.title,
        clientName: t.client?.name ?? null,
        meetingDate: t.meetingDate ? new Date(t.meetingDate).toISOString().slice(0, 10) : null,
        durationMinutes: t.durationMinutes,
        attendees: (t.attendees as ReportTranscriptInput["attendees"]) ?? [],
        summary: t.summary,
        actionItems: (t.actionItems as ReportTranscriptInput["actionItems"]) ?? [],
        rawText: t.rawText,
      };

      try {
        const generated = (await generateMeetingReport(input)) as StoredMeetingReport;
        overrideReports.set(source.transcriptId!, generated);

        if (canSaveDaily) {
          const now = new Date();
          await db.clientMeetingTranscript.update({
            where: { id: source.transcriptId! },
            data: {
              report: generated as unknown as Prisma.InputJsonValue,
              reportConfidence: generated.overallConfidence,
              reportGeneratedAt: now,
              reportGeneratedBy: userId,
            },
          });
        }
      } catch (err) {
        if (err instanceof GeminiUnavailableError) {
          return NextResponse.json({ success: true, data: { aiUnavailable: true } });
        }
        if (err instanceof MeetingReportError) {
          // One bad day must not sink the week — carry on without it.
          notes.push(`Could not generate the daily report for ${source.date}: ${err.message}`);
          continue;
        }
        throw err;
      }
    }

    if (missing.length && !canSaveDaily) {
      notes.push(
        "Missing daily reports were generated for this rollup but not saved — that needs the Edit Report permission.",
      );
    }
  }

  // Re-load so the backfilled reports feed the aggregation.
  const context = overrideReports.size
    ? await loadWeekContext(orgId, clientId, weekStart, { includeDates: dates, overrideReports })
    : initial;
  if (!context) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  const daysWithoutReport = context.sources.filter((s) => !s.hasReport && !overrideReports.has(s.transcriptId ?? ""));
  if (daysWithoutReport.length) {
    notes.push(
      `${daysWithoutReport.length} huddle(s) had no transcript report and contributed attendance only: ${daysWithoutReport
        .map((s) => s.date)
        .join(", ")}.`,
    );
  }

  // --- 3. Deterministic layer ----------------------------------------------
  const deterministic = computeDeterministicWeek({
    config: context.client,
    roster: context.roster,
    days: context.days,
    weekStart,
    // Approved leave. Rung 0 of the attendance ladder renders these days NA and
    // drops them from the member's denominator, so someone on leave is not
    // scored as absent. The parameter has existed since the attendance rewrite
    // but nothing populated it until now.
    onLeave: context.onLeave,
  });

  // --- 4. AI prose layer ----------------------------------------------------
  const label = weekLabel(context.weekStart, context.weekEnd);
  const aiInput = {
    clientName: context.client.name,
    weekLabel: label,
    weekStart: context.weekStart.toISOString().slice(0, 10),
    weekEnd: context.weekEnd.toISOString().slice(0, 10),
    metrics: deterministic.metrics,
    agendaAdherence: deterministic.heatMap.teamAverage,
    attendance: deterministic.attendance,
    heatMap: deterministic.heatMap,
    blockers: deterministic.blockers,
    notes: context.notes as ParticipantDayNote[],
    unrecognized: deterministic.heatMap.unrecognized,
  };

  let ai;
  try {
    ai = await generateWeeklyReportProse(aiInput);
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      return NextResponse.json({ success: true, data: { aiUnavailable: true } });
    }
    if (err instanceof WeeklyReportError) {
      return NextResponse.json({ success: true, data: { reportError: err.message } });
    }
    throw err;
  }

  // --- 5. Validate, compose, persist ---------------------------------------
  const validation = validateWeeklyReport({
    roster: context.roster,
    weekStart: aiInput.weekStart,
    weekEnd: aiInput.weekEnd,
    metrics: deterministic.metrics,
    attendance: deterministic.attendance,
    heatMap: deterministic.heatMap,
    blockers: deterministic.blockers,
    unrecognized: deterministic.heatMap.unrecognized,
    ai,
  });

  const report = composeWeeklyReport({
    config: context.client,
    roster: context.roster,
    weekStart: context.weekStart,
    weekEnd: context.weekEnd,
    weekLabel: label,
    deterministic,
    ai,
    sourceDays: context.sources.map((s) => ({
      date: s.date,
      huddleId: s.huddleId,
      transcriptId: s.transcriptId,
      hasReport: s.hasReport || overrideReports.has(s.transcriptId ?? ""),
    })),
  });

  const metrics = buildMetricsSnapshot(report, validation);
  // The bounded digest a monthly or quarterly rollup reads instead of a
  // period of raw fact rows (doc 17 §R2).
  const factSet = buildWeeklyFactSet(report);
  const now = new Date();

  // Provenance for the cache key (doc 17 §L). Without these the stored report
  // cannot prove what it was built from, so every subsequent Generate re-runs
  // the whole pipeline and re-bills whether or not anything changed.
  const cacheState = await computeWeeklyCacheState(orgId, clientId, context);

  // The store owns the versioning, sign-off-clearing and undelete rules, so
  // they are written once rather than in every generate route.
  const saved = await upsertReport({
    orgId,
    clientId,
    kind: KIND,
    scopeKey: scopeKeyFor({ kind: KIND, periodStart: weekStart }),
    periodStart: weekStart,
    periodEnd: context.weekEnd,
    report,
    metrics,
    factSet,
    validation,
    sourceFingerprint: cacheState.sourceFingerprint,
    promptVersion: cacheState.promptVersion,
    schemaVersion: DH_WEEKLY_SCHEMA_VERSION,
    coveragePct: cacheState.coveragePct,
    reportConfidence: report.overallConfidence,
    // Only real huddle rows — a transcript-only day carries a transcript id in
    // `day.id`, which must not be recorded as a huddle reference.
    sourceHuddleIds: context.sources
      .map((s) => s.huddleId)
      .filter((id): id is string => Boolean(id)),
    sourceTranscriptIds: context.days
      .map((d) => d.transcriptId)
      .filter((id): id is string => Boolean(id)),
    generatedBy: userId,
    generatedAt: now,
  });

  {
    // Best-effort: a lost history entry is a nuisance, a lost report is not.
    await snapshotReportVersion({
      orgId,
      clientId,
      reportKind: KIND,
      reportId: saved.id,
      report,
      metrics,
      validation,
      sourceFingerprint: cacheState.sourceFingerprint,
      promptVersion: cacheState.promptVersion,
      schemaVersion: DH_WEEKLY_SCHEMA_VERSION,
      coveragePct: cacheState.coveragePct,
      generatedBy: userId,
    });
  }

  const canEdit = await userCan(userId, orgId, "ClientMeetings.Report", "update");

  return NextResponse.json({
    success: true,
    data: {
      report,
      metrics,
      validation,
      notes,
      generatedAt: now,
      canEdit,
      version: saved?.currentVersion ?? 1,
      // Freshly generated, so by definition current. The sibling GET route
      // compares this fingerprint against the live data on every read.
      sourceFingerprint: cacheState.sourceFingerprint,
      coveragePct: cacheState.coveragePct,
    },
  });
});
