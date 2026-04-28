/**
 * Vercel Cron — hourly tenant brief sweep.
 *
 * Fires every hour at :30 (vercel.json: "30 * * * *"). Each run:
 *   1. Reads the current IST hour (UTC + 5:30 — tenant locale defaults to India per BRD)
 *   2. Selects tenants whose VCFundProfile.dailyBriefHour matches the IST hour
 *   3. For each, generates a Claude Haiku morning briefing
 *   4. Persists as an `ai-daily-summary` timeline event (Home page reads the latest)
 *   5. Emails the briefing to all active partners + analysts in the tenant
 *
 * Tenants without a VCFundProfile, or with dailyBriefHour ≠ current IST hour,
 * are skipped silently. Emails are best-effort; cron returns 200 even if
 * a few sends fail.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject
 * anything else.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateDailySummary } from "@/lib/ai/prompts/daily-summary";
import { sendEmail } from "@/lib/email";
import NotificationEmail from "@/lib/email/templates/notification";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Current hour in IST (UTC + 5:30). Returns 0-23.
 *
 * Tenant locale will be made configurable in v1.x — see VCFundProfile
 * (we'd add a `timezone` field). For v1, every tenant is IST.
 */
function currentIstHour(): number {
  const now = new Date();
  // Add 5h30m to UTC. Wrap with mod-24.
  const istMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60 + 30;
  return Math.floor((istMinutes / 60) % 24);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const istHour = currentIstHour();

  // Only tenants whose dailyBriefHour matches the current IST hour. Tenants
  // without a fund profile are skipped (no brief preference set).
  const tenants = await db.tenant.findMany({
    where: {
      tenantAppAccess: {
        some: { app: { slug: "quikvc" }, enabled: true },
      },
      vcFundProfile: { dailyBriefHour: istHour },
    },
    select: { id: true, name: true },
  });

  if (tenants.length === 0) {
    return NextResponse.json({
      success: true,
      data: { istHour, tenants: [], note: "no tenants scheduled for this hour" },
    });
  }

  const results: {
    tenantId: string;
    tenantName: string;
    isStub: boolean;
    emailsSent: number;
  }[] = [];
  const since = new Date(Date.now() - 24 * 3600_000);

  for (const t of tenants) {
    const [
      activeDeals,
      openQuestions,
      recentDocs,
      redSignals,
      amberSignals,
      newDeals,
      highlights,
      anchorDeal,
    ] = await Promise.all([
      db.vCDeal.count({ where: { tenantId: t.id, closedStatus: "open" } }),
      db.vCDealQuestion.count({ where: { tenantId: t.id, status: "open" } }),
      db.vCDealDocument.count({
        where: { tenantId: t.id, status: "under-review", createdAt: { gte: since } },
      }),
      db.vCDealSignal.count({
        where: { tenantId: t.id, severity: "red", status: { not: "resolved" } },
      }),
      db.vCDealSignal.count({
        where: { tenantId: t.id, severity: "amber", status: { not: "resolved" } },
      }),
      db.vCDeal.count({ where: { tenantId: t.id, createdAt: { gte: since } } }),
      db.vCTimelineEvent.findMany({
        where: {
          tenantId: t.id,
          createdAt: { gte: since },
          type: { in: ["stage-advanced", "memo-frozen", "transcript-analysed", "score-overridden"] },
        },
        select: { summary: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.vCDeal.findFirst({
        where: { tenantId: t.id, closedStatus: "open" },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const summary = await generateDailySummary({
      tenantName: t.name,
      activeDeals,
      openQuestions,
      recentDocs,
      redSignals,
      amberSignals,
      newDealsLast24h: newDeals,
      recentHighlights: highlights.map((h) => h.summary),
    });

    if (anchorDeal) {
      await db.vCTimelineEvent.create({
        data: {
          tenantId: t.id,
          dealId: anchorDeal.id,
          type: "ai-daily-summary",
          actorId: null,
          summary: summary.text,
          payload: {
            activeDeals,
            openQuestions,
            redSignals,
            amberSignals,
            newDealsLast24h: newDeals,
            tokensUsed: summary.tokensUsed,
          },
          visibility: "internal",
        },
      });
    }

    // Email the brief to active partners + analysts (best-effort).
    // Skipped when summary is the stub (Claude not configured) — no point
    // emailing "[AI stub …]" to real users.
    let emailsSent = 0;
    if (!summary.isStub && emailEnabled()) {
      const recipients = await db.membership.findMany({
        where: {
          tenantId: t.id,
          status: "active",
          role: { in: ["partner", "analyst", "fund-admin"] },
        },
        select: { user: { select: { email: true, firstName: true } } },
      });

      const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3008";
      const subject = `${t.name} — daily brief`;

      const sends = await Promise.allSettled(
        recipients
          .filter((m) => !!m.user.email)
          .map((m) =>
            sendEmail({
              to: m.user.email!,
              subject,
              template: NotificationEmail({
                title: subject,
                body: summary.text,
                href: "/home",
                recipientName: m.user.firstName ?? undefined,
                tenantName: t.name,
                appUrl,
              }),
            }),
          ),
      );
      emailsSent = sends.filter((s) => s.status === "fulfilled").length;
    }

    results.push({
      tenantId: t.id,
      tenantName: t.name,
      isStub: summary.isStub,
      emailsSent,
    });
    console.info(
      `[cron/daily-summary] ${t.name} ${summary.isStub ? "(stub)" : "✓"} emails=${emailsSent}`,
    );
  }

  return NextResponse.json({ success: true, data: { istHour, tenants: results } });
}

/** Email kill-switch — same env knob as the notify() helper. */
function emailEnabled(): boolean {
  const v = (process.env.NOTIFICATIONS_EMAIL_ENABLED ?? "true").toLowerCase().trim();
  return v !== "false" && v !== "0" && v !== "no";
}
