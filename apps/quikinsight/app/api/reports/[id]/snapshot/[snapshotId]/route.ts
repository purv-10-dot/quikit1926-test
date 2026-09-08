import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/reports/[id]/snapshot/[snapshotId] — Phase 3 (see PHASE_LOG.md).
 * Returns one stored snapshot's full data verbatim, for /reports/compare.
 * Never touches a connector or re-fetches anything — the whole point of a
 * snapshot is that it's already computed and frozen.
 *
 * QiReportSnapshot.data holds one of two shapes depending on which Phase 2
 * path wrote it:
 *  - manual view (/reports/generated) → DashboardData, { kpis: KPIMetric[] }
 *    with a numeric `rawValue` per KPI — comparable.
 *  - scheduled send (cron/insights) → InsightsReport, { sections: [...] }
 *    with no top-level kpis and no rawValue anywhere — NOT comparable the
 *    same way. Rather than silently rendering nothing or crashing client-side,
 *    this route detects the shape and reports it via `kind`, so the compare
 *    page can show an explicit "this snapshot can't be compared" state.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; snapshotId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const orgId = (session.user as any).orgId as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization selected" }, { status: 400 });

  const { id: reportId, snapshotId } = await ctx.params;

  const report = await (db as any).qiReport.findFirst({
    where: { id: reportId, orgId, userId },
    select: { id: true },
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const snapshot = await (db as any).qiReportSnapshot.findFirst({
    where: { id: snapshotId, reportId },
  });
  if (!snapshot) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });

  const data = snapshot.data as any;
  const kind: "dashboard" | "insights-report" | "unknown" =
    Array.isArray(data?.kpis) ? "dashboard" :
    Array.isArray(data?.sections) ? "insights-report" :
    "unknown";

  return NextResponse.json({
    success: true,
    data: {
      id: snapshot.id,
      snapshotDate: snapshot.snapshotDate.toISOString().slice(0, 10),
      windowStart: snapshot.windowStart.toISOString().slice(0, 10),
      windowEnd: snapshot.windowEnd.toISOString().slice(0, 10),
      generatedAt: snapshot.generatedAt.toISOString(),
      kind,
      // Only the comparable shape is handed back as `kpis` — kind tells the
      // caller whether to trust it.
      kpis: kind === "dashboard" ? data.kpis : [],
    },
  });
}
