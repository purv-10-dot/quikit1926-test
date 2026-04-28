/**
 * Vercel Cron — daily AI summary per tenant.
 *
 * Wired to fire once a day from vercel.json. Reads each QuikVC-enabled tenant,
 * gathers anomalies (overdue investor payments, IC deadlines in 48h, Q&A
 * completions, doc rejections) and asks Claude Haiku for a plain-English
 * morning briefing.
 *
 * Sprint 2: stub. Returns the data Claude WOULD see, but skips the actual API
 * call (no Claude key wired yet). Sprint 3 connects the model.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject
 * anything else.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Auth check — cron-only endpoint
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Find every QuikVC-enabled tenant
  const tenants = await db.tenant.findMany({
    where: {
      tenantAppAccess: {
        some: { app: { slug: "quikvc" }, enabled: true },
      },
    },
    select: { id: true, name: true },
  });

  const results: { tenantId: string; tenantName: string; signals: number }[] = [];

  for (const t of tenants) {
    // Sprint 2: just count signals; Sprint 3 sends them to Claude.
    const [openQuestions, recentDocs, activeDeals] = await Promise.all([
      db.vCDealQuestion.count({ where: { tenantId: t.id, status: "open" } }),
      db.vCDealDocument.count({
        where: {
          tenantId: t.id,
          status: "under-review",
          createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
        },
      }),
      db.vCDeal.count({ where: { tenantId: t.id, closedStatus: "open" } }),
    ]);

    const signals = openQuestions + recentDocs;
    results.push({ tenantId: t.id, tenantName: t.name, signals });

    console.info(
      `[cron/daily-summary] tenant=${t.name} active=${activeDeals} signals=${signals}`,
    );
    // Sprint 3: build prompt, call Claude Haiku, persist briefing for the
    // VC home screen, optionally email if signals > threshold.
  }

  return NextResponse.json({ success: true, data: { tenants: results } });
}
