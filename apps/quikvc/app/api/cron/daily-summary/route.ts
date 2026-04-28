/**
 * Vercel Cron — daily AI summary per tenant.
 *
 * Fires once a day (vercel.json: "30 0 * * *" = 06:00 IST). Reads each
 * QuikVC-enabled tenant, gathers signal counts + recent timeline highlights,
 * sends to Claude Haiku for a 60-100 word morning briefing. Persists the
 * briefing as an `ai-daily-summary` timeline event so the Home page can
 * read the latest one without re-calling Claude.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject
 * anything else.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateDailySummary } from "@/lib/ai/prompts/daily-summary";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const tenants = await db.tenant.findMany({
    where: {
      tenantAppAccess: {
        some: { app: { slug: "quikvc" }, enabled: true },
      },
    },
    select: { id: true, name: true },
  });

  const results: { tenantId: string; tenantName: string; isStub: boolean }[] = [];
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

    results.push({ tenantId: t.id, tenantName: t.name, isStub: summary.isStub });
    console.info(`[cron/daily-summary] ${t.name} ${summary.isStub ? "(stub)" : "✓"}`);
  }

  return NextResponse.json({ success: true, data: { tenants: results } });
}
