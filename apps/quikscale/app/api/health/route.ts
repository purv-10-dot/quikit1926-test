import { NextResponse } from "next/server";

/**
 * GET /api/health — liveness probe
 *
 * Returns 200 if the process is running. No auth, no DB check.
 * Used by load balancers and orchestrators (ECS, K8s) to decide
 * whether to route traffic to this instance.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
