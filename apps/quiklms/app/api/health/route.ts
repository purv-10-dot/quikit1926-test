import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Liveness probe. Returns 200 with the app name + commit SHA if available.
 * Public endpoint — keep it that way (no DB calls, no auth, no PII).
 *
 * Standardized across the QuikIT fleet (matches apps/quiktrack and apps/_template).
 * Two deliberate properties, both shared with the other apps' probes:
 *   1. Shape is the platform `{ success, data }` envelope — the same contract
 *      every other app's /api/health uses, so the super-admin health-check cron
 *      (apps/quikit/app/api/super/cron/health-check) sees a uniform body. That
 *      cron only inspects the HTTP status (2xx = up), so this always answers 200.
 *   2. It does NOT touch the database. Liveness must not couple to the DB — a
 *      transient DB fault must not mark the app "down" (that is a readiness
 *      concern), and the old DB-probing version returned the raw Prisma error
 *      (connection string, host, port, user) to an unauthenticated caller on
 *      its failure branch. A pure liveness literal removes that leak entirely.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      name: "quiklms",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      timestamp: new Date().toISOString(),
    },
  });
}
