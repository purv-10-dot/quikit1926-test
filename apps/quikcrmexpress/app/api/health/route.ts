import { NextResponse } from "next/server";

/**
 * GET /api/health — LIVENESS. Always 200. No DB, no Redis, no auth, no PII.
 *
 * Matches quiktrack/quikasset/quiksupport: the orchestrator uses this to decide
 * whether the process is alive, so it must not depend on anything external.
 *
 * This previously ran a Postgres `SELECT 1` and a Redis PING and returned 503
 * when either failed — a READINESS probe wearing a liveness URL. A transient DB
 * blip therefore told the orchestrator the container was dead and got the pod
 * restarted, where siblings would merely have been pulled out of rotation. It
 * also returned raw Postgres/Redis error strings to unauthenticated callers.
 *
 * The dependency checks now live at /api/health/ready, with the error detail
 * gated behind HEALTH_TOKEN.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      name: "quikcrmexpress",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      timestamp: new Date().toISOString(),
    },
  });
}
