import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { generateStructured, LlmUnavailableError, LlmValidationError } from "@/lib/ai/llm";
import { buildWmPrompt, PROMPT_VERSION as WM_PROMPT_VERSION } from "@/lib/ai/prompts/wmProse";
import { weeklyMeetingFingerprint } from "@/lib/reports/fingerprint";
import { snapshotReportVersion } from "@/lib/reports/versions";
import { buildWwwReview } from "@/lib/reports/wwwReview";
import { buildNewWww } from "@/lib/reports/newWww";
import { loadWmContext, WmContextError } from "@/lib/reports/wmData";
import {
  computeDeterministicWm,
  composeWmReport,
  buildWmMetrics,
  wmAiSchema,
  WM_SCHEMA_VERSION,
  type WmAi,
  type WwwSectionInput,
} from "@/lib/reports/wmCompose";

export const runtime = "nodejs";
/**
 * Generous for the indexed reads and the WWW pull, not for the model call — the
 * one AI pass here sees ~3k tokens of finished tables, however long the meeting
 * ran. Extraction, the expensive part, already happened.
 */
export const maxDuration = 120;

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const bodySchema = z.object({
  weeklyMeetingId: z.string().min(1),
  /** Regenerate even when the stored report is still current. */
  force: z.boolean().optional(),
});

/**
 * POST /api/client-meetings/reports/weekly-meeting/generate
 *
 * Build and persist the Weekly Meeting Report for one meeting.
 *
 * THE TRANSCRIPT IS NEVER READ HERE
 * ---------------------------------
 * A weekly meeting runs three to six hours. Extraction (P5) already turned it
 * into facts; this route reads those rows, computes every number in TypeScript,
 * and makes ONE model call over the finished tables. The prompt is the same
 * ~3k tokens whether the meeting ran ninety minutes or eight.
 *
 * CACHED on `(sourceFingerprint, promptVersion, schemaVersion)`. All three
 * matching means nothing has changed, so nothing is spent.
 *
 * PARTIAL COVERAGE IS REPORTED, NOT HIDDEN. When extraction did not read the
 * whole meeting the report is marked PARTIAL, names the exact windows it
 * missed, and cannot be signed off.
 *
 * PERMISSION — `ClientMeetings.Report: update`. Generating spends money and
 * overwrites the stored row, clearing any sign-off.
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
  const { weeklyMeetingId, force } = parsed.data;

  let context;
  try {
    context = await loadWmContext(orgId, weeklyMeetingId);
  } catch (err) {
    if (err instanceof WmContextError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    throw err;
  }

  // Extraction still running is a wait, not a failure. Generating now would
  // produce a report from a fraction of the meeting and cache it.
  if (
    context.extraction &&
    ["PENDING", "PREPARING", "EXTRACTING", "CONSOLIDATING"].includes(context.extraction.status)
  ) {
    return NextResponse.json(
      {
        success: true,
        data: {
          pending: true,
          runId: context.extraction.runId,
          status: context.extraction.status,
          message: "Extraction is still running for this meeting.",
        },
      },
      { status: 202 },
    );
  }

  const clientId = context.meeting.clientId;
  const meetingDay = context.meeting.meetingDate.toISOString().slice(0, 10);

  // ── Sections 5 & 6, from the P7 services ────────────────────────────────
  // Built BEFORE the cache check, because WWW state is part of the fingerprint:
  // an owner completing an item after generation makes the review section wrong,
  // and that has to register as staleness.
  const [review, newWww] = await Promise.all([
    buildWwwReview({ orgId, userId }, clientId, context.meeting.meetingDate),
    context.transcript
      ? buildNewWww(orgId, context.transcript.id, clientId)
      : Promise.resolve(null),
  ]);

  const fingerprint = weeklyMeetingFingerprint({
    orgId,
    clientId,
    weeklyMeetingId,
    transcripts: context.transcript
      ? [
          {
            transcriptId: context.transcript.id,
            transcriptVersion: 1,
            extractionVersion: context.extraction?.extractionVersion ?? 0,
            coveragePct: context.extraction?.coveragePct ?? null,
          },
        ]
      : [],
    roster: context.roster.map((m) => ({
      clientMemberId: m.id,
      attendanceType: m.attendanceType,
      aliases: [],
    })),
    config: {
      plannedStartTime: context.client.weeklyStartTime,
      plannedEndTime: context.client.weeklyEndTime,
      agendaConfig: context.client.agenda,
    },
    humanEdits: {
      absences: Object.fromEntries(
        context.markedAbsentIds.map((id) => [id, [{ date: meetingDay, reason: null }]]),
      ),
      segmentFlags: pickFlags(context.meeting.flags),
    },
    wwwState: review.rows.map((r) => ({
      wwwItemId: r.id,
      status: r.status,
      when: r.when.toISOString().slice(0, 10),
      revisions: r.revisedDates.length,
    })),
  });

  const existing = await db.clientWeeklyMeetingReport.findFirst({
    where: { orgId, weeklyMeetingId, deletedAt: null },
    select: {
      id: true,
      report: true,
      metrics: true,
      currentVersion: true,
      completeness: true,
      sourceFingerprint: true,
      promptVersion: true,
      schemaVersion: true,
    },
  });

  const isCurrent =
    existing !== null &&
    existing.sourceFingerprint === fingerprint &&
    existing.promptVersion === WM_PROMPT_VERSION &&
    existing.schemaVersion === WM_SCHEMA_VERSION;

  if (isCurrent && !force) {
    return NextResponse.json({
      success: true,
      data: {
        report: existing.report,
        metrics: existing.metrics,
        version: existing.currentVersion,
        completeness: existing.completeness,
        cacheHit: true,
        tokensSpent: 0,
      },
    });
  }

  // ── Deterministic layer ─────────────────────────────────────────────────
  const deterministic = computeDeterministicWm(context);

  // ── One AI pass, over tables only ───────────────────────────────────────
  const prompt = buildWmPrompt({
    clientName: context.client.name,
    meetingDateLabel: context.meeting.meetingDate.toISOString().slice(0, 10),
    callHeld: context.meeting.callStatus === "HELD",
    attendance: {
      present: deterministic.attendance.present,
      absent: deterministic.attendance.absent,
      expected: deterministic.attendance.expected,
      onLeave: deterministic.attendance.onLeave,
      unknown: deterministic.attendance.unknown,
      attendancePct: deterministic.attendance.attendancePct,
    },
    agenda: deterministic.segments.rows.map((r) => ({
      label: r.label,
      coverage: r.coverage,
      timeDiscipline: r.timeDiscipline,
      expectedMinutes: r.expectedMinutes,
      actualMinutes: r.actualMinutes,
      flagDisagrees: r.flagDisagrees,
    })),
    kpi: deterministic.kpiRows.map((r) => ({
      name: r.name,
      kpiRag: r.kpiRag,
      priorityRag: r.priorityRag,
      keyPoints: r.keyPoints,
      ragConflict: r.ragConflict,
    })),
    gaps: deterministic.gaps.map((g) => ({
      gap: g.gap,
      agreedAction: g.agreedAction,
      scope: g.scope,
      raisedBy: g.raisedBy,
    })),
    discussions: deterministic.discussions.map((d) => ({
      kind: d.kind,
      summary: d.summary,
      wasDeferred: d.wasDeferred,
    })),
    www: {
      reviewed: review.summary.total,
      completed: review.summary.completed,
      overdue: review.summary.overdue,
      carriedForward: review.summary.carriedForward,
      newCaptured: newWww?.summary.total ?? 0,
      newIncomplete: newWww?.summary.needsInput ?? 0,
    },
    scorecard: deterministic.scorecard.metrics.map((m) => ({
      label: m.label,
      reading: m.reading,
      rag: m.rag,
    })),
    overall: deterministic.scorecard.overall,
    coveragePct: deterministic.coveragePct,
    missingWindowLabels: deterministic.missingWindows.map((w) => w.label),
  });

  let ai: WmAi;
  let tokensInput = 0;
  let tokensOutput = 0;
  let costUsd = 0;
  let modelId: string | null = null;

  try {
    const result = await generateStructured<WmAi>({
      orgId,
      clientId,
      feature: "WM_PROSE",
      promptVersion: WM_PROMPT_VERSION,
      prompt,
      transcriptId: context.transcript?.id ?? null,
      reportKind: "WM",
      reportId: existing?.id ?? null,
      schema: wmAiSchema,
    });
    ai = result.data;
    tokensInput = result.usage.inputTokens;
    tokensOutput = result.usage.outputTokens;
    costUsd = result.costUsd;
    modelId = result.model;
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      return NextResponse.json({ success: true, data: { aiUnavailable: true } });
    }
    if (err instanceof LlmValidationError) {
      return NextResponse.json({
        success: true,
        data: { reportError: "The model's response could not be validated." },
      });
    }
    throw err;
  }

  const reviewSection: WwwSectionInput = {
    available: true,
    unavailableReason: null,
    scopeLimited: review.scopeLimited,
    rows: review.rows as unknown as Array<Record<string, unknown>>,
  };
  // An absent section says why. A silently empty table would read as "nothing
  // was committed", which is a different and false statement.
  const newWwwSection: WwwSectionInput = newWww
    ? {
        available: true,
        unavailableReason: null,
        rows: newWww.candidates as unknown as Array<Record<string, unknown>>,
      }
    : {
        available: false,
        unavailableReason: "No transcript has been attached to this meeting.",
        rows: [],
      };

  const report = composeWmReport({
    context,
    deterministic,
    ai,
    wwwReview: reviewSection,
    newWww: newWwwSection,
  });
  const metrics = buildWmMetrics(deterministic);
  const now = new Date();

  const common = {
    report: report as unknown as Prisma.InputJsonValue,
    metrics: metrics as unknown as Prisma.InputJsonValue,
    reportConfidence: ai.overallConfidence,
    coveragePct: deterministic.coveragePct,
    completeness: deterministic.completeness,
    processingLimitations:
      deterministic.missingWindows as unknown as Prisma.InputJsonValue,
    sourceFingerprint: fingerprint,
    promptVersion: WM_PROMPT_VERSION,
    schemaVersion: WM_SCHEMA_VERSION,
    modelId,
    extractionVersion: context.extraction?.extractionVersion ?? null,
    tokensInput,
    tokensOutput,
    costUsd,
    generatedAt: now,
    generatedBy: userId,
    updatedBy: userId,
  };

  await db.clientWeeklyMeetingReport.upsert({
    where: { orgId_weeklyMeetingId: { orgId, weeklyMeetingId } },
    create: {
      orgId,
      clientId,
      weeklyMeetingId,
      meetingDate: context.meeting.meetingDate,
      currentVersion: 1,
      ...common,
    },
    update: {
      ...common,
      currentVersion: { increment: 1 },
      // A regenerated report is unreviewed again — sign-off must be re-earned.
      validatedAt: null,
      validatedBy: null,
      // Regenerating a deleted report brings it back — the upsert lands on the
      // soft-deleted row, which would otherwise stay hidden with fresh content.
      deletedAt: null,
    },
  });

  const saved = await db.clientWeeklyMeetingReport.findFirst({
    where: { orgId, weeklyMeetingId },
    select: { id: true, currentVersion: true },
  });

  if (saved) {
    await snapshotReportVersion({
      orgId,
      clientId,
      reportKind: "WM",
      reportId: saved.id,
      report,
      metrics,
      sourceFingerprint: fingerprint,
      promptVersion: WM_PROMPT_VERSION,
      schemaVersion: WM_SCHEMA_VERSION,
      modelId,
      tokensInput,
      tokensOutput,
      costUsd,
      coveragePct: deterministic.coveragePct,
      generatedBy: userId,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      report,
      metrics,
      version: saved?.currentVersion ?? 1,
      completeness: deterministic.completeness,
      coveragePct: deterministic.coveragePct,
      missingWindows: deterministic.missingWindows,
      cacheHit: false,
      generatedAt: now,
      /** Proof of the saving, on every response. */
      tokensSpent: tokensInput + tokensOutput,
      costUsd,
    },
  });
});

/**
 * The seven human agenda flags, for the fingerprint.
 *
 * A facilitator changing one is a real edit that must mark the report stale —
 * their verdict outranks the transcript's, so the report has to be rebuilt
 * around it.
 */
function pickFlags(row: Record<string, unknown>): Record<string, string> {
  const keys = [
    "goodNewsSharing",
    "kpDashboard",
    "gaps",
    "www",
    "feedback",
    "collectiveIntelligence",
    "opspReview",
    "punctualityOverride",
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
