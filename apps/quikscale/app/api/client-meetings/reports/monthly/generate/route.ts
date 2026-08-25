import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { generateStructured, LlmUnavailableError, LlmValidationError } from "@/lib/ai/llm";
import { buildMonthlyPrompt } from "@/lib/ai/prompts/monthlyProse";
import { monthlyFingerprint } from "@/lib/reports/fingerprint";
import { snapshotReportVersion } from "@/lib/reports/versions";
import {
  loadMonthContext,
  computeDeterministicMonth,
  composeMonthlyReport,
  buildMonthlyMetrics,
  monthlySourceInputs,
  monthlyAiSchema,
  monthBounds,
  MONTHLY_SCHEMA_VERSION,
  MONTHLY_PROMPT_VERSION,
  type MonthlyAi,
} from "@/lib/reports/monthlyCompose";

export const runtime = "nodejs";
/**
 * One small model call over pre-computed tables. Generous only for the four
 * indexed reads and the fact aggregate — not because the model call is slow.
 */
export const maxDuration = 120;

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const bodySchema = z.object({
  clientId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be yyyy-mm"),
  /** Regenerate even when the stored report is still current. */
  force: z.boolean().optional(),
});

/**
 * POST /api/client-meetings/reports/monthly/generate
 *
 * Build and persist the Monthly Report for one client-month.
 *
 * THE CHEAPEST REPORT IN THE SYSTEM
 * ---------------------------------
 * A month is roughly 20 daily huddles and 4 weekly meetings — about 1.4M tokens
 * of transcript. This reads four `ClientDailyHuddleWeeklyReport.metrics`
 * snapshots, the WWW lifecycle and SQL aggregates over the fact layer, then
 * makes ONE model call over the resulting tables: ~5k tokens.
 *
 * Every number in the report is computed here in TypeScript. The model
 * contributes observations and recommendations only — it never produces a
 * figure, and the prompt says so explicitly.
 *
 * CACHED. A stored report whose sources have not been regenerated is returned
 * as-is, with no model call at all, unless `force` is set.
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
  const { clientId, period, force } = parsed.data;

  const bounds = monthBounds(period);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid period" }, { status: 400 });
  }

  const context = await loadMonthContext({ orgId, userId }, clientId, period);
  if (!context) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  // A month with no weekly reports has nothing to trend. Generating a confident
  // empty report would be worse than saying so.
  const reported = context.weeks.filter((w) => w.reportId).length;
  if (reported === 0) {
    return NextResponse.json({
      success: true,
      data: {
        noData: true,
        weeks: context.weeks.map((w) => ({ label: w.label, weekStart: w.weekStart })),
        message: "No weekly reports exist for this month yet.",
      },
    });
  }

  // ── Cache check ─────────────────────────────────────────────────────────
  const sources = monthlySourceInputs(context);
  const fingerprint = monthlyFingerprint({
    orgId,
    clientId,
    period,
    sourceReports: sources.sourceReports,
    wwwState: sources.wwwState,
  });

  const existing = await db.clientMonthlyReport.findFirst({
    where: { orgId, clientId, periodStart: bounds.start, deletedAt: null },
    select: {
      id: true,
      report: true,
      metrics: true,
      currentVersion: true,
      sourceFingerprint: true,
      promptVersion: true,
      schemaVersion: true,
    },
  });

  const isCurrent =
    existing !== null &&
    existing.sourceFingerprint === fingerprint &&
    existing.promptVersion === MONTHLY_PROMPT_VERSION &&
    existing.schemaVersion === MONTHLY_SCHEMA_VERSION;

  if (isCurrent && !force) {
    // The cache hit that makes this architecture worth the effort: nothing
    // changed, so nothing is spent.
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

  // ── Deterministic layer ─────────────────────────────────────────────────
  const deterministic = await computeDeterministicMonth(orgId, context);

  // ── One AI pass, over tables only ───────────────────────────────────────
  const prompt = buildMonthlyPrompt({
    clientName: context.client.name,
    periodLabel: context.periodLabel,
    weekLabels: context.weeks.filter((w) => w.reportId).map((w) => w.label),
    trends: deterministic.trends,
    recurringStucks: deterministic.recurringStucks,
    www: deterministic.www,
    noStuckOutliers: deterministic.noStuckOutliers.map((o) => ({
      name: o.name,
      noStuckRate: o.noStuckRate,
      huddlesAttended: o.huddlesAttended,
    })),
    missingWeeks: deterministic.missingWeeks,
  });

  let ai: MonthlyAi;
  let tokensInput = 0;
  let tokensOutput = 0;
  let costUsd = 0;
  let modelId: string | null = null;

  try {
    const result = await generateStructured<MonthlyAi>({
      orgId,
      clientId,
      feature: "MONTHLY",
      promptVersion: MONTHLY_PROMPT_VERSION,
      prompt,
      reportKind: "MONTHLY",
      reportId: existing?.id ?? null,
      schema: monthlyAiSchema,
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

  const report = composeMonthlyReport({ context, deterministic, ai });
  const metrics = buildMonthlyMetrics(deterministic);
  const now = new Date();

  await db.clientMonthlyReport.upsert({
    where: {
      orgId_clientId_periodStart: { orgId, clientId, periodStart: bounds.start },
    },
    create: {
      orgId,
      clientId,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      report: report as unknown as Prisma.InputJsonValue,
      metrics: metrics as unknown as Prisma.InputJsonValue,
      reportConfidence: ai.overallConfidence,
      sourceWeeklyReportIds: sources.sourceReports.map((r) => r.reportId),
      sourceWmReportIds: context.wmReportIds,
      missingWeeks: deterministic.missingWeeks,
      sourceFingerprint: fingerprint,
      promptVersion: MONTHLY_PROMPT_VERSION,
      schemaVersion: MONTHLY_SCHEMA_VERSION,
      modelId,
      tokensInput,
      tokensOutput,
      costUsd,
      currentVersion: 1,
      generatedAt: now,
      generatedBy: userId,
      updatedBy: userId,
    },
    update: {
      periodEnd: bounds.end,
      report: report as unknown as Prisma.InputJsonValue,
      metrics: metrics as unknown as Prisma.InputJsonValue,
      reportConfidence: ai.overallConfidence,
      sourceWeeklyReportIds: sources.sourceReports.map((r) => r.reportId),
      sourceWmReportIds: context.wmReportIds,
      missingWeeks: deterministic.missingWeeks,
      sourceFingerprint: fingerprint,
      promptVersion: MONTHLY_PROMPT_VERSION,
      schemaVersion: MONTHLY_SCHEMA_VERSION,
      modelId,
      tokensInput,
      tokensOutput,
      costUsd,
      currentVersion: { increment: 1 },
      generatedAt: now,
      generatedBy: userId,
      updatedBy: userId,
      // A regenerated report is unreviewed again — sign-off must be re-earned.
      validatedAt: null,
      validatedBy: null,
      // Regenerating a deleted month brings it back — the upsert lands on the
      // soft-deleted row, which would otherwise stay hidden with fresh content.
      deletedAt: null,
    },
  });

  const saved = await db.clientMonthlyReport.findFirst({
    where: { orgId, clientId, periodStart: bounds.start },
    select: { id: true, currentVersion: true },
  });

  if (saved) {
    await snapshotReportVersion({
      orgId,
      clientId,
      reportKind: "MONTHLY",
      reportId: saved.id,
      report,
      metrics,
      sourceFingerprint: fingerprint,
      promptVersion: MONTHLY_PROMPT_VERSION,
      schemaVersion: MONTHLY_SCHEMA_VERSION,
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
      version: saved?.currentVersion ?? 1,
      cacheHit: false,
      generatedAt: now,
      missingWeeks: deterministic.missingWeeks,
      /** Proof of the saving, on every response. */
      tokensSpent: tokensInput + tokensOutput,
      costUsd,
    },
  });
});
