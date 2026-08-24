import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { isOrgAdmin } from "@/lib/api/visibility";
import { sharedRateLimiter } from "@/lib/ai/rateLimiter";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/**
 * GET /api/client-meetings/reports/metrics?days=30[&clientId=…]
 *
 * Cost and cache observability for the AI meeting pipeline.
 *
 * WHY THIS EXISTS
 * ---------------
 * The whole architecture is built to avoid paying the model twice for the same
 * work: extract once, cache the report, read from Postgres. None of that is
 * trustworthy unless it is measured, and before this endpoint there was no
 * token accounting for QuikScale's AI at all — `usageMetadata` was discarded on
 * every call.
 *
 * The headline number is REPORT CACHE HIT RATE: the share of report views
 * served from storage rather than regenerated. Target > 95%. If it falls, the
 * fingerprint is too sensitive (see `lib/reports/fingerprint.ts`) or something
 * is regenerating on a read path, and either is a live cost incident.
 *
 * This endpoint NEVER calls a model — it only aggregates `AiUsageLog`.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §O.
 */
const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  clientId: z.string().min(1).optional(),
});

/** Serialise a Prisma Decimal | number | null to a plain rounded number. */
function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : 0;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

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

  // Cost data spans every client in the org, so it is an admin view. The
  // resource permission already gates the module; this narrows it further
  // rather than exposing org-wide spend to anyone who can read one report.
  if (!(await isOrgAdmin(userId, orgId))) {
    return NextResponse.json(
      { success: false, error: "Admin access required" },
      { status: 403 },
    );
  }

  const { days, clientId } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Every query below is scoped by orgId. `clientId` narrows further when given.
  const scope = { orgId, createdAt: { gte: since }, ...(clientId ? { clientId } : {}) };

  const [byFeature, byStatus, byClient, totals, runCount, reportRows, jobRows] =
    await Promise.all([
      db.aiUsageLog.groupBy({
        by: ["feature", "model"],
        where: scope,
        _sum: { inputTokens: true, outputTokens: true, cachedTokens: true, costUsd: true },
        _count: { _all: true },
        _avg: { latencyMs: true },
      }),
      db.aiUsageLog.groupBy({
        by: ["status"],
        where: scope,
        _count: { _all: true },
      }),
      db.aiUsageLog.groupBy({
        by: ["clientId"],
        where: scope,
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        _count: { _all: true },
      }),
      db.aiUsageLog.aggregate({
        where: scope,
        _sum: { inputTokens: true, outputTokens: true, cachedTokens: true, costUsd: true },
        _count: { _all: true },
      }),
      // Distinct transcripts touched, for "tokens per meeting".
      db.aiUsageLog
        .findMany({
          where: { ...scope, transcriptId: { not: null } },
          select: { transcriptId: true },
          distinct: ["transcriptId"],
        })
        .then((r) => r.length),
      db.clientDailyHuddleWeeklyReport.findMany({
        where: {
          orgId,
          deletedAt: null,
          ...(clientId ? { clientId } : {}),
          generatedAt: { gte: since },
        },
        select: { currentVersion: true, coveragePct: true, validatedAt: true },
      }),
      db.meetingReportJob.groupBy({
        by: ["status", "reportKind"],
        where: { orgId, createdAt: { gte: since }, ...(clientId ? { clientId } : {}) },
        _count: { _all: true },
      }),
    ]);

  const totalCalls = totals._count._all;
  const inputTokens = totals._sum.inputTokens ?? 0;
  const outputTokens = totals._sum.outputTokens ?? 0;
  const cachedTokens = totals._sum.cachedTokens ?? 0;

  const statusCount = (s: string) =>
    byStatus.find((r) => r.status === s)?._count._all ?? 0;

  // Regeneration rate: versions beyond the first, per report. A high value
  // means the fingerprint is churning — UI noise rather than a cost incident,
  // because staleness never auto-regenerates, but still worth tuning.
  const totalVersions = reportRows.reduce((n, r) => n + (r.currentVersion ?? 1), 0);
  const regenerations = totalVersions - reportRows.length;

  const partialReports = reportRows.filter(
    (r) => r.coveragePct !== null && r.coveragePct < 100,
  ).length;

  return NextResponse.json({
    success: true,
    data: {
      window: { days, since: since.toISOString(), clientId: clientId ?? null },

      /**
       * Report Cache Hit Rate — the project's primary KPI.
       *
       * `generations` counts prose passes actually run; `reportsTracked` counts
       * distinct stored reports in the window. Serving a saved report writes no
       * usage row at all, which is exactly the point: a read is invisible here
       * because it costs nothing.
       *
       * NOTE: a true hit rate needs the read-side counter that lands with the
       * report GET routes in Phase 2. Until then `generationsPerReport` is the
       * honest proxy — it answers "how often did we pay per report we hold?" —
       * and `cacheHitRate` is deliberately null rather than a fabricated number.
       */
      cache: {
        cacheHitRate: null as number | null,
        cacheHitRatePending: "Read-side counter lands with the Phase 2 report GET routes",
        reportsTracked: reportRows.length,
        generations: totalVersions,
        regenerations,
        regenerationRate: pct(regenerations, reportRows.length),
        partialReports,
        signedOff: reportRows.filter((r) => r.validatedAt !== null).length,
      },

      tokens: {
        input: inputTokens,
        output: outputTokens,
        cached: cachedTokens,
        total: inputTokens + outputTokens,
        /** Share of input served from the provider's cache — see §G lever 4. */
        cachedInputRate: pct(cachedTokens, inputTokens),
        perMeeting: runCount > 0 ? Math.round((inputTokens + outputTokens) / runCount) : null,
        perReport:
          reportRows.length > 0
            ? Math.round((inputTokens + outputTokens) / reportRows.length)
            : null,
      },

      cost: {
        totalUsd: money(totals._sum.costUsd),
        perMeetingUsd: runCount > 0 ? money(Number(totals._sum.costUsd ?? 0) / runCount) : null,
        perReportUsd:
          reportRows.length > 0
            ? money(Number(totals._sum.costUsd ?? 0) / reportRows.length)
            : null,
        byClient: byClient
          .map((c) => ({
            clientId: c.clientId,
            calls: c._count._all,
            tokens: (c._sum.inputTokens ?? 0) + (c._sum.outputTokens ?? 0),
            costUsd: money(c._sum.costUsd),
          }))
          .sort((a, b) => b.costUsd - a.costUsd),
      },

      calls: {
        total: totalCalls,
        meetingsTouched: runCount,
        byFeature: byFeature
          .map((f) => ({
            feature: f.feature,
            model: f.model,
            calls: f._count._all,
            inputTokens: f._sum.inputTokens ?? 0,
            outputTokens: f._sum.outputTokens ?? 0,
            costUsd: money(f._sum.costUsd),
            avgLatencyMs: f._avg.latencyMs ? Math.round(f._avg.latencyMs) : null,
          }))
          .sort((a, b) => b.costUsd - a.costUsd),
      },

      /**
       * Quality signals. Each has a distinct meaning:
       *   invalidOutputRate — the model is fighting the schema; tighten the prompt
       *   repairRate        — recoverable, but every repair is a second call
       *   rateLimitedRate   — lower EXTRACT_CONCURRENCY or raise the env limits
       */
      health: {
        okRate: pct(statusCount("OK") + statusCount("REPAIRED"), totalCalls),
        invalidOutputRate: pct(statusCount("INVALID_OUTPUT"), totalCalls),
        repairRate: pct(statusCount("REPAIRED"), totalCalls),
        rateLimitedRate: pct(statusCount("RATE_LIMITED"), totalCalls),
        errorRate: pct(statusCount("ERROR"), totalCalls),
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      },

      jobs: jobRows.map((j) => ({
        reportKind: j.reportKind,
        status: j.status,
        count: j._count._all,
      })),

      /**
       * Live rate-limiter state for THIS serverless instance only. Buckets are
       * per-process by design (see `lib/ai/rateLimiter.ts`), so treat this as a
       * spot check on one instance, not an org-wide figure. `observed429`
       * turning non-zero is the signal to tune the env limits.
       */
      rateLimiter: sharedRateLimiter.stats(),
    },
  });
});
