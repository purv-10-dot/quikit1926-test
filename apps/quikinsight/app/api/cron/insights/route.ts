import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildReportForUser } from "@/lib/insights/report";
import { renderInsightsEmail } from "@/lib/insights/emailTemplate";
import { sendReportEmail } from "@/lib/insights/mailer";
import { isDue, toBuilderFrequency } from "@/lib/reports/scope";

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
