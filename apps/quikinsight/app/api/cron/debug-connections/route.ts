import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { getAggregatedDashboard } from "@/lib/data/aggregator";
import { generateInsights } from "@/lib/insights/generator";
import { frequencyToDays, frequencyLabel } from "@/lib/insights/report";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * TEMP DEBUG — investigating why buildReportForUser's email path reports
 * "No connected platforms" for a report/user whose snapshot (getAggregatedDashboard,
 * workspace-scoped) has confirmed real data. See PHASE_LOG.md 2026-09-09 entries for
 * the pattern this continues (the earlier `days` bug used the same debug-field
 * approach). Read-only — makes no writes, sends no email, calls no connector.
 *
 * DELETE THIS FILE once the investigation concludes.
 *
 * GET /api/cron/debug-connections?userId=...&reportId=...
 *   Authorization: Bearer <CRON_SECRET>   (same secret as /api/cron/insights)
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const reportId = searchParams.get("reportId");
  if (!userId) return NextResponse.json({ error: "userId query param required" }, { status: 400 });

  const report = reportId
    ? await (db as any).qiReport.findUnique({ where: { id: reportId } })
    : null;

  // Exactly what buildReportForUser (lib/insights/report.ts:45-48) queries —
  // unscoped by workspace, the email path's own "empty" check.
  const unscoped = await (prisma as any).platformConnection.findMany({
    where: { userId, status: "CONNECTED" },
    select: { id: true, platform: true, status: true, workspaceId: true },
  });

  // Exactly what the snapshot path (app/api/reports/[id]/snapshot/route.ts and
  // the fixed cron snapshot branch) queries when a workspaceId is known —
  // computeAggregatedDashboard's own filter (lib/data/aggregator.ts:263-264).
  const scoped = report?.workspaceId
    ? await (prisma as any).platformConnection.findMany({
        where: { userId, status: "CONNECTED", workspaceId: report.workspaceId },
        select: { id: true, platform: true, status: true, workspaceId: true },
      })
    : null;

  // Every connection row for this userId regardless of status, to see the full
  // picture (e.g. rows that exist but aren't status: "CONNECTED", or carry an
  // unexpected workspaceId).
  const allForUser = await (prisma as any).platformConnection.findMany({
    where: { userId },
    select: { id: true, platform: true, status: true, workspaceId: true, userId: true },
  });

  // ── Part 2: does getAggregatedDashboard's per-platform DATA fetch (not just
  // the connection-existence check) actually depend on workspaceId? Run it
  // both ways for the same user/day-count and compare data.platforms shape,
  // plus what generateInsights would do with each result — this is the direct
  // test of the hypothesis that buildReportForUser's missing workspaceId
  // reaches getAggregatedDashboard's connector calls (lib/data/aggregator.ts
  // ~288-297: getGA4Data/getAllMetaInsights/getYouTubeData/etc. all take
  // workspaceId as an explicit arg), not just its connection-existence query.
  const connectedSet: Set<string> = new Set(unscoped.map((c: any) => c.platform as string));
  const days = frequencyToDays("WEEKLY");
  const genOpts = { periodLabel: "debug", frequencyLabel: frequencyLabel("WEEKLY"), generatedAt: new Date().toISOString() };

  let withoutWorkspaceId: any = null;
  let withoutWorkspaceIdError: string | null = null;
  try {
    const data = await getAggregatedDashboard(userId, days); // exactly buildReportForUser's own call
    const built = generateInsights(data, connectedSet, genOpts);
    withoutWorkspaceId = {
      platformsPresent: Object.keys(data.platforms ?? {}),
      sectionsBuilt: built.sections.map((s) => s.key),
      empty: built.empty,
    };
  } catch (e) {
    withoutWorkspaceIdError = e instanceof Error ? e.message : String(e);
  }

  let withWorkspaceId: any = null;
  let withWorkspaceIdError: string | null = null;
  if (report?.workspaceId) {
    try {
      const data = await getAggregatedDashboard(userId, days, report.workspaceId);
      const built = generateInsights(data, connectedSet, genOpts);
      withWorkspaceId = {
        platformsPresent: Object.keys(data.platforms ?? {}),
        sectionsBuilt: built.sections.map((s) => s.key),
        empty: built.empty,
      };
    } catch (e) {
      withWorkspaceIdError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    ok: true,
    _tempDebug: true,
    input: { userId, reportId },
    report: report ? { id: report.id, userId: report.userId, workspaceId: report.workspaceId, name: report.name } : null,
    unscopedConnectionsFound_matchesBuildReportForUser: unscoped.length,
    unscopedConnections: unscoped,
    scopedToReportWorkspaceId_matchesSnapshotPath: report?.workspaceId ? scoped?.length ?? 0 : "report has no workspaceId — scoped query was skipped",
    scopedConnections: scoped,
    allConnectionRowsForThisUserId_anyStatusOrWorkspace: allForUser,
    part2_dataFetchComparison: {
      getAggregatedDashboard_withoutWorkspaceId_matchesBuildReportForUser: withoutWorkspaceId,
      getAggregatedDashboard_withoutWorkspaceId_error: withoutWorkspaceIdError,
      getAggregatedDashboard_withReportWorkspaceId_matchesSnapshotPath: withWorkspaceId,
      getAggregatedDashboard_withWorkspaceId_error: withWorkspaceIdError,
    },
  });
}
