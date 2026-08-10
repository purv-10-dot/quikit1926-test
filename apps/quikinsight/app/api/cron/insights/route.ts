import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReportForUser, type Frequency } from "@/lib/insights/report";
import { renderInsightsEmail } from "@/lib/insights/emailTemplate";
import { sendReportEmail } from "@/lib/insights/mailer";

export const runtime = "nodejs";
// Hobby plan caps functions at 60s. Sends are sequential; a large enabled-user
// list could exceed this — move to Pro (or a queue) if that day comes.
export const maxDuration = 60;

// How much time must elapse since the last send before a report is "due".
// Slightly under the nominal window to tolerate cron jitter (this route is
// intended to run once a day; each run sends whichever users are due).
const DUE_AFTER_MS: Record<Frequency, number> = {
  DAILY: 23 * 60 * 60 * 1000,
  WEEKLY: (7 * 24 - 2) * 60 * 60 * 1000,
  MONTHLY: (30 * 24 - 12) * 60 * 60 * 1000,
};

function isDue(frequency: Frequency, lastSentAt: Date | null, now: number): boolean {
  if (!lastSentAt) return true;
  return now - lastSentAt.getTime() >= DUE_AFTER_MS[frequency];
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://moreyeahs-mos-dashboard.vercel.app";

  const enabledSettings = await prisma.emailReportSettings.findMany({
    where: { enabled: true },
    include: { user: { select: { name: true, email: true } } },
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Sequential to stay well within SMTP rate limits; the volume is small.
  for (const s of enabledSettings) {
    const frequency = s.frequency as Frequency;

    if (!isDue(frequency, s.lastSentAt, now) || s.recipients.length === 0) {
      skipped++;
      continue;
    }

    try {
      const report = await buildReportForUser(s.userId, frequency);

      // Only send when the user actually has a connected platform.
      if (report.empty) {
        skipped++;
        continue;
      }

      const { subject, html } = renderInsightsEmail(report, {
        recipientName: s.user?.name ?? null,
        appUrl,
      });

      const result = await sendReportEmail({ to: s.recipients, subject, html });
      if (result.ok) {
        await prisma.emailReportSettings.update({
          where: { userId: s.userId },
          data: { lastSentAt: new Date() },
        });
        sent++;
      } else {
        failed++;
        errors.push(`send:${result.error}`);
        console.error(`[cron/insights] send failed for ${s.userId}:`, result.error);
      }
    } catch (err) {
      failed++;
      errors.push(`build:${err instanceof Error ? err.message : String(err)}`);
      console.error(`[cron/insights] report failed for ${s.userId}:`, err);
    }
  }

  console.log(
    JSON.stringify({ event: "cron_insights", candidates: enabledSettings.length, sent, skipped, failed })
  );

  return NextResponse.json({ ok: true, candidates: enabledSettings.length, sent, skipped, failed, errors });
}
