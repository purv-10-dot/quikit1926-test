import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processDueRecurring } from "@/lib/recurring";

export const dynamic = "force-dynamic";

/**
 * Scheduled endpoint: generate documents for every org's due recurring profiles.
 * Protected by CRON_SECRET (Vercel sends it as a Bearer token for cron jobs).
 * If CRON_SECRET is unset, the route is allowed (dev convenience) — set it in production.
 */
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret." } }, { status: 401 });
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const orgs = (await prisma.$queryRaw<Array<{ org_id: string }>>`
      SELECT DISTINCT org_id FROM recurring_transactions WHERE is_active = true AND next_run_date <= ${today}::date`) ?? [];

    let generated = 0;
    for (const { org_id } of orgs) {
      generated += await processDueRecurring(prisma, org_id, null, today);
    }

    return NextResponse.json({ data: { date: today, orgs: orgs.length, generated } });
  } catch (error) {
    return NextResponse.json(
      { error: { code: "CRON_FAILED", message: error instanceof Error ? error.message : "Cron run failed" } },
      { status: 500 }
    );
  }
}

export const GET = run;
export const POST = run;
