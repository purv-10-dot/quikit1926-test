import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/reports/[id]/snapshots — Phase 3 of the report snapshot/comparison
 * feature (see PHASE_LOG.md). Lists the available snapshot dates for one
 * report, newest first, to populate /reports/compare's two date pickers.
 *
 * Returns only id/snapshotDate/generatedAt — never the (potentially large)
 * `data` JSON blob, which the comparison page fetches per-snapshot via
 * GET /api/reports/[id]/snapshot/[snapshotId] once a date is actually picked.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const orgId = (session.user as any).orgId as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization selected" }, { status: 400 });

  const { id: reportId } = await ctx.params;

  const report = await (db as any).qiReport.findFirst({
    where: { id: reportId, orgId, userId },
    select: { id: true },
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const snapshots = await (db as any).qiReportSnapshot.findMany({
    where: { reportId },
    select: { id: true, snapshotDate: true, generatedAt: true },
    orderBy: { snapshotDate: "desc" },
  });

  return NextResponse.json({
    success: true,
    data: snapshots.map((s: any) => ({
      id: s.id,
      snapshotDate: s.snapshotDate.toISOString().slice(0, 10),
      generatedAt: s.generatedAt.toISOString(),
    })),
  });
}
