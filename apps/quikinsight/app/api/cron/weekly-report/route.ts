import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEmailReport, resolveOrgId } from "@/lib/insights/buildEmailReport";
import { sendReportEmail } from "@/lib/insights/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-report — the Monday 08:00 IST scheduled report.
 *
 * Triggered by the Kubernetes CronJob in k8s/weekly-report-cronjob.yaml (which
 * is deployed from the GitOps repo, uat-k8s-infra-quikit). The schedule lives
 * there, not here — this route just does the work whenever it is called, so it
 * is also safe to invoke by hand for a re-send.
 *
 * Audience: every QiEmailReportSettings row with `enabled = true` and
 * `frequency = 'WEEKLY'` — the same opt-in the settings screen already writes,
 * so there is no second toggle for users to discover.
 *
 * This is a SEPARATE system from /api/cron/insights: it renders the rich
 * /reports-page email via lib/insights/buildEmailReport rather than the
 * summary-style buildReportForUser, and it fires on a fixed weekday instead of
 * a rolling "is it due yet" window.
 *
 * Sends are sequential to stay inside SMTP rate limits. There is no platform
 * timeout to fit inside here (unlike serverless), but the CronJob caps the call
 * at 600s — if the enabled-user list ever outgrows that, move to a queue rather
 * than raising the cap.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`, matching /api/cron/insights.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.emailReportSettings.findMany({
    where: { enabled: true, frequency: "WEEKLY" },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const s of settings) {
    if (s.recipients.length === 0) {
      skipped++;
      continue;
    }

    try {
      // No session here, so the org has to be resolved from the user's own data.
      const orgId = await resolveOrgId(s.userId);

      const report = await buildEmailReport({ userId: s.userId, orgId });

      // Nothing connected → nothing worth emailing. Not a failure.
      if (!report) {
        skipped++;
        continue;
      }

      const result = await sendReportEmail({
        to: s.recipients,
        subject: report.subject,
        html: report.html,
      });

      if (result.ok) {
        // Stamping lastSentAt also suppresses a same-week duplicate from
        // /api/cron/insights, whose WEEKLY window is ~7 days.
        await prisma.emailReportSettings.update({
          where: { userId: s.userId },
          data: { lastSentAt: new Date() },
        });
        sent++;
      } else {
        failed++;
        errors.push(`send:${result.error}`);
        console.error(`[cron/weekly-report] send failed for ${s.userId}:`, result.error);
      }
    } catch (err) {
      // One bad user must not abort the run — the rest of the list still goes out.
      failed++;
      errors.push(`build:${err instanceof Error ? err.message : String(err)}`);
      console.error(`[cron/weekly-report] report failed for ${s.userId}:`, err);
    }
  }

  console.log(
    JSON.stringify({ event: "cron_weekly_report", candidates: settings.length, sent, skipped, failed })
  );

  return NextResponse.json({ ok: true, candidates: settings.length, sent, skipped, failed, errors });
}
