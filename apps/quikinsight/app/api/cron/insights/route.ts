import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildReportForUser } from "@/lib/insights/report";
import { renderInsightsEmail } from "@/lib/insights/emailTemplate";
import { sendReportEmail } from "@/lib/insights/mailer";
import { isDue, toBuilderFrequency, rangeDays } from "@/lib/reports/scope";
import { saveReportSnapshot } from "@/lib/reports/snapshot";
import { trailingWindow } from "@/lib/period/resolve";
import { getAggregatedDashboard } from "@/lib/data/aggregator";

export const runtime = "nodejs";
// Hobby plan caps functions at 60s. Sends are sequential; a large due list
// could exceed this — move to Pro (or a queue) if that day comes.
export const maxDuration = 60;

/**
 * Scheduled report delivery.
 *
 * DRIVEN BY QiReport — the report library is the single source of schedule
 * truth. The old per-user QiEmailReportSettings row is no longer read here;
 * anything it held was migrated into QiReport, and the settings screen now
 * edits reports instead.
 *
 * PER USER. Each report is built as its author (`report.userId`) via
 * buildReportForUser, so the numbers are exactly what that person sees in the
 * app — a report can be emailed to outsiders, but it is never built as one.
 *
 * Due-ness is per report, tracked on QiReport.lastSentAt, so two reports with
 * different cadences do not interfere.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://insights.quikit.ai";

  // Everything with a cadence and somewhere to go. "none" never qualifies.
  const scheduled = await db.qiReport.findMany({
    where: { frequency: { not: "none" }, NOT: { recipients: { isEmpty: true } } },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Sequential to stay well within SMTP rate limits; the volume is small.
  for (const report of scheduled) {
    if (!isDue(report.frequency, report.lastSentAt, now)) {
      skipped++;
      continue;
    }

    try {
      const built = await buildReportForUser(report.userId, toBuilderFrequency(report.frequency));

      // Nothing connected yet — sending an empty report trains people to ignore it.
      if (built.empty) {
        skipped++;
        continue;
      }

      const author = await db.user.findUnique({
        where: { id: report.userId },
        select: { firstName: true, email: true },
      });

      const { subject, html } = renderInsightsEmail(built, {
        recipientName: author?.firstName ?? null,
        appUrl,
      });

      const result = await sendReportEmail({
        to: report.recipients,
        // The author named the report; use it so a recipient with several
        // subscriptions can tell them apart.
        subject: report.name ? `${report.name} — ${subject}` : subject,
        html,
      });

      if (result.ok) {
        await db.qiReport.update({
          where: { id: report.id },
          data: { lastSentAt: new Date() },
        });
        sent++;

        // Additive side effect — see lib/reports/snapshot.ts. Awaited (not
        // fire-and-forget) so it can't be killed mid-write when this
        // serverless function returns, but wrapped in its own try/catch so a
        // failure here can NEVER affect the send that already succeeded above.
        //
        // Deliberately does NOT snapshot `built` (the InsightsReport used to
        // render the email above) — that shape has no top-level `kpis` array
        // and no numeric `rawValue`, so it can't be diffed by /reports/compare.
        // Instead this re-runs getAggregatedDashboard, the same aggregation
        // call the manual-view snapshot endpoint (app/api/reports/[id]/
        // snapshot/route.ts) already uses, so every future scheduled-send
        // snapshot is shaped exactly like a manual-view one — a real `kpis`
        // array with `rawValue` per KPI — regardless of what shape the email
        // itself is built from. This is a second server-side computation of
        // already-fetched-this-request-cycle numbers, not a new external call
        // beyond what buildReportForUser above already made — the Meta 28-day
        // clamp inside lib/connectors/instagram.ts/facebook.ts applies exactly
        // as it does everywhere else, since nothing here changes the window.
        //
        // `days` here is the report's own configured `dateRange` (via
        // rangeDays, same as the manual-view snapshot endpoint) — NOT
        // frequencyToDays(frequency). Confirmed by debug output that using
        // frequency (daily → 1 day) was clamping the snapshot to a 1-day
        // window and returning genuine zeros; the report's dateRange is the
        // period it's meant to reflect, independent of how often it sends.
        // buildReportForUser's own days calculation for the EMAIL above is
        // untouched — it still derives from frequency, as before.
        try {
          const snapshotWorkspaceId = report.workspaceId ?? undefined;
          const snapshotDays = rangeDays(report);
          const dashboardData = await getAggregatedDashboard(
            report.userId,
            snapshotDays,
            snapshotWorkspaceId,
          );
          await saveReportSnapshot({
            reportId: report.id,
            window: trailingWindow(snapshotDays),
            data: dashboardData,
          });
        } catch (snapshotErr) {
          console.error(`[cron/insights] snapshot failed for report ${report.id}:`, snapshotErr);
        }
      } else {
        failed++;
        errors.push(`send:${result.error}`);
        console.error(`[cron/insights] send failed for report ${report.id}:`, result.error);
      }
    } catch (err) {
      failed++;
      errors.push(`build:${err instanceof Error ? err.message : String(err)}`);
      console.error(`[cron/insights] report ${report.id} failed:`, err);
    }
  }

  console.log(
    JSON.stringify({ event: "cron_insights", candidates: scheduled.length, sent, skipped, failed }),
  );

  return NextResponse.json({ ok: true, candidates: scheduled.length, sent, skipped, failed, errors });
}
