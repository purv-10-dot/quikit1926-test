import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isRedisAvailable } from "@quikit/redis";

/**
 * GET /api/health/ready — readiness probe
 *
 * Checks that both critical dependencies are reachable:
 *   1. PostgreSQL (via Prisma `$queryRaw`)
 *   2. Redis (via PING, if configured)
 *
 * Returns 200 when all checks pass, 503 when any check fails.
 * Detailed check info only exposed with HEALTH_TOKEN auth header.
 */
export async function GET(request: NextRequest) {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // 1. PostgreSQL check
  const dbStart = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    checks.postgres = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (error: unknown) {
    checks.postgres = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: error instanceof Error ? error.message : "DB unreachable",
    };
  }

  // 2. Redis check (optional — passes if REDIS_URL is not set)
  const redisStart = Date.now();
  try {
    const available = await isRedisAvailable();
    const redisConfigured = !!process.env.REDIS_URL;
    checks.redis = {
      ok: redisConfigured ? available : true, // not configured = not required
      latencyMs: Date.now() - redisStart,
      ...(redisConfigured ? {} : { error: "REDIS_URL not set (optional)" }),
    };
  } catch (error: unknown) {
    checks.redis = {
      ok: false,
      latencyMs: Date.now() - redisStart,
      error: error instanceof Error ? error.message : "Redis unreachable",
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  // Only expose detailed checks to internal callers (via shared token)
  const token = process.env.HEALTH_TOKEN;
  const auth = request.headers.get("authorization");
  const showDetails = token && auth === `Bearer ${token}`;

  return NextResponse.json(
    {
      status: allOk ? "ready" : "degraded",
      timestamp: new Date().toISOString(),
      ...(showDetails ? { checks } : {}),
    },
    { status: allOk ? 200 : 503 },
  );
}
