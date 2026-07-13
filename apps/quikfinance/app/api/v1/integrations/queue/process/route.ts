import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processQueue } from "@/lib/integrations/queue/processor";

export const dynamic = "force-dynamic";

/**
 * Background worker trigger. Intended for a scheduler (Vercel Cron / external).
 * Protected by CRON_SECRET. Drains queued integration jobs across all orgs that
 * have work, acting as a parallel worker (SKIP LOCKED makes concurrent calls safe).
 */
async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret." } }, { status: 401 });
    }
  }

  const worker = `worker-${request.headers.get("x-worker-id") ?? "default"}`;
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "10"), 50);

  try {
    const orgs = (await prisma.$queryRaw`
      SELECT DISTINCT org_id FROM integration_jobs WHERE status = 'queued' AND scheduled_at <= now()
    `) as Array<{ org_id: string }>;

    const results: Record<string, unknown> = {};
    let totalProcessed = 0;
    for (const { org_id } of orgs) {
      const res = await processQueue(prisma, org_id, worker, limit);
      results[org_id] = res;
      totalProcessed += res.claimed;
    }
    return NextResponse.json({ data: { orgs: orgs.length, processed: totalProcessed, results } });
  } catch (error) {
    return NextResponse.json(
      { error: { code: "QUEUE_FAILED", message: error instanceof Error ? error.message : "Queue processing failed" } },
      { status: 500 }
    );
  }
}

export const GET = run;
export const POST = run;
