import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRedis, isRedisEnabled } from "@/lib/db/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health/ready — READINESS. Touches Postgres and Redis; 200 when the
 * app can serve traffic, 503 when a dependency is down so the load balancer
 * pulls it out of rotation (without the orchestrator killing the process — see
 * /api/health for the liveness probe).
 *
 * Mirrors apps/quikscale/app/api/health/ready/route.ts, including its rule that
 * the `checks` detail — which contains raw driver error strings — is only
 * returned to a caller presenting `Authorization: Bearer ${HEALTH_TOKEN}`.
 * Anonymous callers get the verdict and nothing else.
 */
export async function GET(request: NextRequest) {
  const checks: Record<string, { ok: boolean; status?: string; error?: string }> = {};

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.postgres = { ok: true };
  } catch (e) {
    checks.postgres = { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }

  if (!isRedisEnabled()) {
    // Redis is optional — features that need it degrade rather than fail, so an
    // unconfigured Redis is "ready", not "down".
    checks.redis = { ok: true, status: "disabled" };
  } else {
    try {
      const ping = await getRedis().ping();
      checks.redis = { ok: ping === "PONG" };
    } catch (e) {
      checks.redis = { ok: false, error: e instanceof Error ? e.message : "unknown" };
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);

  const token = process.env.HEALTH_TOKEN;
  const showDetails =
    !!token && request.headers.get("authorization") === `Bearer ${token}`;

  return NextResponse.json(
    {
      status: ok ? "ready" : "degraded",
      timestamp: new Date().toISOString(),
      ...(showDetails ? { checks } : {}),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
