import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-report — RETIRED.
 *
 * Report delivery is now driven by ONE schedule: the QiReport library, sent by
 * /api/cron/insights, which handles daily, weekly and monthly cadences and
 * tracks due-ness per report.
 *
 * This route used to send a second weekly email from QiEmailReportSettings.
 * Leaving it live alongside the new path would deliver TWO emails to anyone on
 * a weekly cadence, so it is now a deliberate no-op rather than deleted code:
 * the Kubernetes CronJob in the GitOps repo (k8s/weekly-report-cronjob.yaml)
 * still calls this URL, and a 404 there would show up as a failing job.
 *
 * TO FINISH THE RETIREMENT: delete that CronJob, then delete this file.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(
    JSON.stringify({
      event: "cron_weekly_report_noop",
      reason: "retired — delivery moved to /api/cron/insights over QiReport",
    }),
  );

  return NextResponse.json({
    ok: true,
    retired: true,
    message:
      "Weekly report delivery moved to /api/cron/insights, driven by the report library. This endpoint no longer sends; remove its CronJob.",
  });
}
