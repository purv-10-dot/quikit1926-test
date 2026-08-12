import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAggregatedDashboard } from "@/lib/data/aggregator";
import { getCache, setCache, CACHE_TTL } from "@/lib/dashboardCache";
import { getActiveWorkspaceId } from "@/lib/workspace";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const url       = new URL(req.url);
  const days      = Math.min(Math.max(Number(url.searchParams.get("days") ?? 28), 1), 365);
  const userId    = session.user.id;
  const orgId     = (session.user.orgId as string) ?? "";
  const startTs   = Date.now();
  const workspaceId = await getActiveWorkspaceId(userId, orgId);

  // Serve from cache if fresh
  const cached = getCache();
  if (cached && Date.now() - cached.ts < CACHE_TTL && cached.days === days && (cached as any).workspaceId === workspaceId) {
    return NextResponse.json(
      { data: cached.data, source: "cache", generatedAt: new Date(cached.ts).toISOString() },
      { headers: { ...CORS, "Cache-Control": "no-store" } }
    );
  }

  try {
    const data = await getAggregatedDashboard(userId, days, workspaceId);

    setCache({ data, ts: Date.now(), days, workspaceId } as any);

    console.log(JSON.stringify({
      event:     "dashboard_fetch",
      userId,
      durationMs: Date.now() - startTs,
      sources:   data.dataSources,
      alerts:    data.alerts,
    }));

    return NextResponse.json(
      { data, source: "live", generatedAt: new Date().toISOString() },
      { headers: { ...CORS, "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[dashboard-data] aggregator failed:", err);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500, headers: CORS }
    );
  }
}
