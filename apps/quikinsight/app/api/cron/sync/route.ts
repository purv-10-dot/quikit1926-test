import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAggregatedDashboard } from "@/lib/data/aggregator";

// Vercel cron: scheduled in vercel.json. Hobby plan allows one run/day only.
export const runtime = "nodejs";
export const maxDuration = 60; // Hobby cap (default would be 10s once scheduled)

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTs = Date.now();

  // Get all distinct active users with at least one connection
  const users = await prisma.platformConnection.findMany({
    where:    { status: "CONNECTED" },
    select:   { userId: true },
    distinct: ["userId"],
  });

  const results = await Promise.allSettled(
    users.map(async ({ userId }: { userId: string }) => {
      const syncStart = Date.now();
      try {
        const data = await getAggregatedDashboard(userId);

        const connections = await prisma.platformConnection.findMany({
          where: { userId, status: "CONNECTED" },
          // orgId is required on QiDataSync; the connection is the tenant source.
          select: { id: true, platform: true, orgId: true },
        });

        await prisma.dataSync.createMany({
          data: connections.map((conn: { id: string; platform: string; orgId: string }) => ({
            userId,
            orgId:        conn.orgId,
            connectionId: conn.id,
            platform:     conn.platform as never,
            syncType:     "incremental",
            status:       "SUCCESS",
            completedAt:  new Date(),
            recordCount:  data.kpis.reduce((s: number, k: { rawValue: number }) => s + (k.rawValue > 0 ? 1 : 0), 0),
          })),
          skipDuplicates: true,
        });

        return { userId, status: "success" };
      } catch (err) {
        const connections = await prisma.platformConnection.findMany({
          where: { userId, status: "CONNECTED" },
          // orgId is required on QiDataSync; the connection is the tenant source.
          select: { id: true, platform: true, orgId: true },
        });
        await prisma.dataSync.createMany({
          data: connections.map((conn: { id: string; platform: string; orgId: string }) => ({
            userId,
            orgId:        conn.orgId,
            connectionId: conn.id,
            platform:     conn.platform as never,
            syncType:     "incremental",
            status:       "FAILED",
            completedAt:  new Date(),
            errorMessage: err instanceof Error ? err.message : String(err),
          })),
          skipDuplicates: true,
        });
        return { userId, status: "error", error: String(err) };
      }
    })
  );

  const succeeded = results.filter(
    (r: PromiseSettledResult<{ status: string }>) => r.status === "fulfilled" && r.value.status === "success"
  ).length;

  console.log(JSON.stringify({
    event:      "cron_sync",
    totalUsers: users.length,
    succeeded,
    durationMs: Date.now() - startTs,
  }));

  return NextResponse.json({
    synced:     succeeded,
    total:      users.length,
    durationMs: Date.now() - startTs,
  });
}
