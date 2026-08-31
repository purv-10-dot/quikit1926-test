import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { generateStructured, LlmUnavailableError, LlmValidationError } from "@/lib/ai/llm";
import { buildWeekRollupPrompt } from "@/lib/ai/prompts/weekRollupProse";
import { weekRollupFingerprint } from "@/lib/reports/fingerprint";
import { snapshotReportVersion } from "@/lib/reports/versions";
import { loadWeekRollupContext, weekRollupSources } from "@/lib/reports/weekRollupData";
import { findReport, scopeKeyFor, upsertReport } from "@/lib/reports/reportStore";
import {
  computeDeterministicWeekRollup,
  composeWeekRollupReport,
  buildWeekRollupMetrics,
  weekRollupAiSchema,
  weekBounds,
  WEEK_ROLLUP_SCHEMA_VERSION,
  WEEK_ROLLUP_PROMPT_VERSION,
  type WeekRollupAi,
} from "@/lib/reports/weekRollupCompose";

export const runtime = "nodejs";
/**
 * Six indexed reads and a WWW query, then ONE small model call. Generous for
 * the reads, not because the model call is slow.
 */
export const maxDuration = 120;

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/** This route only ever writes one kind of row in the shared report table. */
const KIND = "WEEK_ROLLUP" as const;

const bodySchema = z.object({
  clientId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be yyyy-mm-dd"),
  /** Regenerate even when the stored rollup is still current. */
  force: z.boolean().optional(),
});

/**
 * POST /api/client-meetings/reports/week-rollup/generate
 *
 * Build and persist the cross-meeting Week Rollup for one client-week.
 *
 * THE ONLY VIEW THAT SPANS BOTH RHYTHMS
 * -------------------------------------
 * The daily-huddle report sees only huddles; the weekly-meeting report sees only
 * one meeting. A blocker raised in Tuesday's huddle and again in Thursday's
 * weekly meeting is invisible in both — and is exactly what this rollup surfaces.
 *
 * IT READS REPORTS, NOT FACTS. Every input is a stored `metrics` or `factSet`
 * column (doc 17 §R2), so the cost is the number of source reports rather than
 * the number of facts — the same property that makes the monthly report cheap.
 *
 * CACHED on `(sourceFingerprint, promptVersion, schemaVersion)`.
 *
 * PERMISSION — `ClientMeetings.Report: update`. Generating spends money and
 * overwrites the stored row, clearing any sign-off.
 */
export const POST = auth.update(async ({ orgId, userId }, req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const { clientId, weekStart, force } = parsed.data;

  const bounds = weekBounds(weekStart);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid week" }, { status: 400 });
  }

  const context = await loadWeekRollupContext({ orgId, userId }, clientId, weekStart);
  if (!context) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  // A week with no reports beneath it has nothing to roll up. Saying so beats
  // generating a confident empty document — and it is a different statement
  // from "no meetings happened", which this route cannot know.
  if (context.sources.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        noData: true,
        weekStart,
        message:
          "No daily-huddle or weekly-meeting report exists for this week yet. Generate those first.",
      },
    });
  }

  const sources = weekRollupSources(context);
  const fingerprint = weekRollupFingerprint({
    orgId,
    clientId,
    weekStart: bounds.start.toISOString().slice(0, 10),
    sourceReports: sources.sourceReports,
    wwwState: context.wwwItems.map((w, i) => ({
      // WWW rows are selected without ids here, so position within the stable
      // query order stands in. It changes whenever the set changes, which is
      // the only property the fingerprint needs from it.
      wwwItemId: String(i),
      status: w.status,
      when: w.when.toISOString().slice(0, 10),
      revisions: w.revisedDates.length,
    })),
  });

  const scopeKey = scopeKeyFor({ kind: KIND, periodStart: bounds.start });
  const existing = await findReport(orgId, KIND, scopeKey);

  const isCurrent =
    existing !== null &&
    existing.sourceFingerprint === fingerprint &&
    existing.promptVersion === WEEK_ROLLUP_PROMPT_VERSION &&
    existing.schemaVersion === WEEK_ROLLUP_SCHEMA_VERSION;

  if (isCurrent && !force) {
    return NextResponse.json({
      success: true,
      data: {
        report: existing.report,
        metrics: existing.metrics,
        version: existing.currentVersion,
        cacheHit: true,
        tokensSpent: 0,
      },
    });
  }

  const deterministic = computeDeterministicWeekRollup(context);

  const prompt = buildWeekRollupPrompt({
    clientName: context.client.name,
    label: context.label,
    sources: context.sources.map((s) => ({
      kind: s.kind,
      label: s.label,
      date: s.date,
    })),
    missingSources: deterministic.missingSources,
    coverageNotes: deterministic.omittedNotes,
    trends: deterministic.trends.map((t) => ({
      label: t.metric,
      direction: t.direction,
      delta: t.delta,
      last: t.last,
      summary: t.summary,
    })),
    blockers: deterministic.blockers,
    www: {
      total: deterministic.www.total,
      completed: deterministic.www.completed,
      overdue: deterministic.www.overdue,
      carriedForward: deterministic.www.carriedForward,
      completionRate: deterministic.www.completionRate,
    },
    topics: deterministic.topics,
  });

  let ai: WeekRollupAi;
  let tokensInput = 0;
  let tokensOutput = 0;
  let costUsd = 0;
  let modelId: string | null = null;

  try {
    const result = await generateStructured<WeekRollupAi>({
      orgId,
      clientId,
      feature: "WEEK_ROLLUP",
      promptVersion: WEEK_ROLLUP_PROMPT_VERSION,
      prompt,
      reportKind: "WEEK_ROLLUP",
      reportId: existing?.id ?? null,
      schema: weekRollupAiSchema,
    });
    ai = result.data;
    tokensInput = result.usage.inputTokens;
    tokensOutput = result.usage.outputTokens;
    costUsd = result.costUsd;
    modelId = result.model;
  } catch (err) {
    if (err instanceof LlmUnavailableError) {
      // Carry the classified reason so the panel can say whether waiting helps
      // (quota window) or a config change is needed (revoked key, retired model).
      console.error(`[report/generate] AI unavailable (${err.reason}): ${err.message}`);
      return NextResponse.json({
        success: true,
        data: {
          aiUnavailable: true,
          aiReason: err.reason,
          aiRetryAfterSec: err.retryAfterSec,
          aiDetail: err.message,
        },
      });
    }
    if (err instanceof LlmValidationError) {
      return NextResponse.json({
        success: true,
        data: { reportError: "The model's response could not be validated." },
      });
    }
    throw err;
  }

  const report = composeWeekRollupReport({ context, deterministic, ai });
  const metrics = buildWeekRollupMetrics(deterministic);
  const now = new Date();

  // The store owns the versioning and sign-off-clearing rules, so they are
  // written once rather than in every generate route.
  const saved = await upsertReport({
    orgId,
    clientId,
    kind: KIND,
    scopeKey,
    periodStart: bounds.start,
    periodEnd: context.weekEnd,
    report,
    metrics,
    reportConfidence: ai.overallConfidence,
    sourceReportIds: sources.sourceReports.map((r) => r.reportId),
    missingSources: deterministic.missingSources,
    sourceFingerprint: fingerprint,
    promptVersion: WEEK_ROLLUP_PROMPT_VERSION,
    schemaVersion: WEEK_ROLLUP_SCHEMA_VERSION,
    modelId,
    tokensInput,
    tokensOutput,
    costUsd,
    generatedBy: userId,
    generatedAt: now,
  });

  {
    await snapshotReportVersion({
      orgId,
      clientId,
      reportKind: KIND,
      reportId: saved.id,
      report,
      metrics,
      sourceFingerprint: fingerprint,
      promptVersion: WEEK_ROLLUP_PROMPT_VERSION,
      schemaVersion: WEEK_ROLLUP_SCHEMA_VERSION,
      modelId,
      tokensInput,
      tokensOutput,
      costUsd,
      generatedBy: userId,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      report,
      metrics,
      version: saved.currentVersion,
      cacheHit: false,
      generatedAt: now,
      missingSources: deterministic.missingSources,
      /** Proof of the saving, on every response. */
      tokensSpent: tokensInput + tokensOutput,
      costUsd,
    },
  });
});
