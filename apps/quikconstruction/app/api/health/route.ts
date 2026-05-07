import { NextResponse } from "next/server";

/**
 * GET /api/health — Liveness probe
 *
 * Returns 200 as long as the Node process is alive and the route handler
 * is reachable. Does NOT touch the database, filesystem, or object store.
 *
 * For "can I serve real traffic?" (DB reachable, migrations applied) use
 * /api/ready instead. Kubernetes and load balancers use the two probes
 * differently:
 *   - livenessProbe   → /api/health  (restart the container if it fails)
 *   - readinessProbe  → /api/ready   (take the container out of rotation
 *                                     if it fails, but don't restart it)
 *
 * Never adds auth or rate limits — probes must work before any dependency
 * is healthy.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      app: "quikconstruction",
      status: "alive",
      version: process.env.APP_RELEASE ?? process.env.npm_package_version ?? "0.1.0",
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
