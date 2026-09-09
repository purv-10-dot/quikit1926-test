import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { getAggregatedDashboardDebug } from "@/lib/data/aggregator";
import { generateInsights } from "@/lib/insights/generator";
import { frequencyToDays, frequencyLabel, type Frequency } from "@/lib/insights/report";
import { toBuilderFrequency } from "@/lib/reports/scope";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * TEMP DEBUG — investigating "MASTER TEST - DO NOT DELETE"
 * (cmttr266b0000w465zs59fnmh) coming back empty from the REAL scheduled cron
 * run (twice, 07:10 and 09:35 today) despite confirmed real connections and
 * despite an isolated hand-constructed test of getAggregatedDashboard +
 * generateInsights succeeding every time. See PHASE_LOG.md 2026-09-09
 * entries for the full investigation so far.
 *
 * This endpoint reruns buildReportForUser's EXACT logic (not a
 * hand-constructed approximation) — same connection query, same
 * frequencyToDays, same getAggregatedDashboard call shape, same
 * generateInsights call — using the SAME (userId, frequency) pair the real
 * cron passes for a given report. The only substitutions are: (1) it calls
 * getAggregatedDashboardDebug instead of getAggregatedDashboard, a new,
 * separate, cache-bypassing wrapper around the identical
 * computeAggregatedDashboard internals (see lib/data/aggregator.ts) that
 * also returns the raw per-platform Promise.allSettled outcome — the same
 * detail already sent to console.error there but otherwise inaccessible
 * without Vercel log access; and (2) it reads `report.frequency` from the DB
 * by reportId instead of trusting a query param, so the frequency really is
 * what the real cron would compute for this report right now.
 *
 * lib/insights/report.ts (buildReportForUser itself) is NOT modified by
 * this investigation — this route duplicates its logic rather than altering
 * the production function, so the production email-building path is
 * provably unaffected regardless of what this endpoint does.
 *
 * Read-only: no email sent, no QiReport/QiReportSnapshot write, no cache
 * write (getAggregatedDashboardDebug bypasses the 60s aggregation cache
 * entirely, so this can't return a stale result from an earlier run, and
 * can't poison the cache for the real cron's next run either).
 *
 * DELETE THIS FILE (and getAggregatedDashboardDebug in lib/data/
 * aggregator.ts) once the investigation concludes.
 *
 * GET /api/cron/debug-run-report?reportId=...
 *   Authorization: Bearer <CRON_SECRET>   (same secret as /api/cron/insights)
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const reportId = searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId query param required" }, { status: 400 });

  const report = await (db as any).qiReport.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });

  const now = new Date();
  const userId: string = report.userId;
  const frequency: Frequency = toBuilderFrequency(report.frequency);

  // ── Exact replica of buildReportForUser (lib/insights/report.ts:40-72) ──
  // Same query, same shape, same order. Only getAggregatedDashboard is
  // swapped for getAggregatedDashboardDebug (see rationale above).
  const connections = await (prisma as any).platformConnection.findMany({
    where: { userId, status: "CONNECTED" },
    select: { platform: true },
  });
  const connected: Set<string> = new Set(connections.map((c: any) => c.platform as string));
  const days = frequencyToDays(frequency);

  if (connected.size === 0) {
    return NextResponse.json({
      ok: true,
      _tempDebug: true,
      input: { reportId, userId, frequency, days, now: now.toISOString() },
      emptyReason: "connections.size === 0 — buildReportForUser would return empty:true here, before ever calling getAggregatedDashboard",
      connectedPlatforms: [],
    });
  }

  const { data, connectorResults } = await getAggregatedDashboardDebug(userId, days);

  const built = generateInsights(data, connected, {
    periodLabel: "debug",
    frequencyLabel: frequencyLabel(frequency),
    generatedAt: now.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    _tempDebug: true,
    input: { reportId, userId, frequency, days, now: now.toISOString() },
    connectedPlatforms: [...connected],
    // The actual per-platform Promise.allSettled outcome — fulfilled with
    // data, or rejected with the real error/timeout message. This is the
    // detail that was previously only visible via console.error in Vercel
    // logs, which we don't have access to.
    connectorResults,
    result: {
      empty: built.empty,
      sectionsBuilt: built.sections.map((s) => s.key),
      overallSummary: built.overallSummary,
    },
  });
}
