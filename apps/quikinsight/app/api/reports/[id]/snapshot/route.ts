import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getAggregatedDashboard } from "@/lib/data/aggregator";
import { rangeDays } from "@/lib/reports/scope";
import { saveReportSnapshot } from "@/lib/reports/snapshot";
import { trailingWindow } from "@/lib/period/resolve";

export const runtime = "nodejs";

/**
 * POST /api/reports/[id]/snapshot — Phase 2 of the report snapshot/comparison
 * feature (see PHASE_LOG.md). Called fire-and-forget by /reports/generated
 * after the scoped ?report=X view finishes loading, so viewing a saved report
 * also records today's snapshot.
 *
 * ADDITIVE ONLY: this is a new endpoint the page calls alongside its existing
 * data fetches, never in place of them. It re-derives the same aggregated
 * data those fetches are built on (getAggregatedDashboard — the function
 * underlying /api/overview, buildReportForUser, and buildEmailReport.ts) so
 * the snapshot matches what the viewer sees, without needing the client to
 * round-trip its already-fetched data back to the server. This is a second
 * server-side computation of the same numbers, not a second call to any
 * external platform API beyond what a normal page load already makes — the
 * Meta 28-day clamp already inside lib/connectors/instagram.ts and
 * facebook.ts applies exactly as it does for the live view.
 *
 * Always responds 200 (even on internal failure) since a snapshot is a
 * side effect the caller intentionally ignores the result of.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 200 });
    const userId = session.user.id;
    const orgId = (session.user as any).orgId as string | undefined;
    if (!orgId) return NextResponse.json({ ok: false }, { status: 200 });

    const { id: reportId } = await ctx.params;

    const report = await (db as any).qiReport.findFirst({
      where: { id: reportId, orgId, userId },
      select: { id: true, dateRange: true, workspaceId: true },
    });
    if (!report) return NextResponse.json({ ok: false }, { status: 200 });

    const days = rangeDays(report as any);
    const workspaceId = report.workspaceId ?? (await getActiveWorkspaceId(userId, orgId));
    const window = trailingWindow(days);

    const data = await getAggregatedDashboard(userId, days, workspaceId);

    await saveReportSnapshot({ reportId: report.id, window, data });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/reports/snapshot] failed:", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
