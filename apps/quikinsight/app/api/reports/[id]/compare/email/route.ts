import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeKpiDeltas } from "@/lib/reports/compare";
import { buildComparisonEmail } from "@/lib/insights/buildComparisonEmail";
import { sendReportEmail } from "@/lib/insights/mailer";

export const runtime = "nodejs";
export const maxDuration = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/reports/[id]/compare/email — Phase 3 "Email comparison" button
 * (see PHASE_LOG.md). Reuses sendReportEmail (lib/insights/mailer.ts)
 * unmodified — that function is already generic (to/subject/html) and needs
 * no changes for this new call site. Builds its HTML via the new, separate
 * buildComparisonEmail — never buildEmailReport.ts / renderInsightsEmail,
 * which stay untouched and keep serving the existing live report email.
 *
 * Loads both snapshots by id server-side (never trusts client-supplied KPI
 * data) so the emailed numbers always match what's actually stored.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const orgId = (session.user as any).orgId as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization selected" }, { status: 400 });

  const { id: reportId } = await ctx.params;

  let body: { to?: unknown; cc?: unknown; bcc?: unknown; snapshotAId?: unknown; snapshotBId?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const parseAddresses = (v: unknown): string[] =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim().toLowerCase())
      .filter((x) => EMAIL_RE.test(x));

  const to = parseAddresses(body.to);
  const cc = parseAddresses(body.cc);
  const bcc = parseAddresses(body.bcc);
  if (!to.length) return NextResponse.json({ error: "No valid recipients" }, { status: 400 });

  const snapshotAId = typeof body.snapshotAId === "string" ? body.snapshotAId : null;
  const snapshotBId = typeof body.snapshotBId === "string" ? body.snapshotBId : null;
  if (!snapshotAId || !snapshotBId) {
    return NextResponse.json({ error: "snapshotAId and snapshotBId are required" }, { status: 400 });
  }

  const report = await (db as any).qiReport.findFirst({
    where: { id: reportId, orgId, userId },
    select: { id: true, name: true },
  });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const [snapA, snapB] = await Promise.all([
    (db as any).qiReportSnapshot.findFirst({ where: { id: snapshotAId, reportId } }),
    (db as any).qiReportSnapshot.findFirst({ where: { id: snapshotBId, reportId } }),
  ]);
  if (!snapA || !snapB) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });

  const kpisA = Array.isArray(snapA.data?.kpis) ? snapA.data.kpis : [];
  const kpisB = Array.isArray(snapB.data?.kpis) ? snapB.data.kpis : [];
  if (!kpisA.length || !kpisB.length) {
    return NextResponse.json(
      { error: "One or both snapshots don't contain comparable KPI data" },
      { status: 422 },
    );
  }

  const rows = computeKpiDeltas(kpisA, kpisB);

  const { subject, html } = buildComparisonEmail(
    {
      reportName: report.name,
      dateA: snapA.snapshotDate.toISOString().slice(0, 10),
      dateB: snapB.snapshotDate.toISOString().slice(0, 10),
      rows,
      generatedAt: new Date().toISOString(),
    },
    { recipientName: session.user.name ?? null, appUrl: process.env.NEXTAUTH_URL ?? "http://localhost:3015" },
  );

  const result = await sendReportEmail({ to, cc, bcc, subject, html });
  if (!result.ok) return NextResponse.json({ sent: false, error: result.error }, { status: 502 });

  return NextResponse.json({ sent: true, recipients: to });
}
