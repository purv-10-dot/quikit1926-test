import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Liveness probe. Returns 200 with the app name + commit SHA if available.
 * Public endpoint — keep it that way (no DB calls, no auth, no PII). Used by
 * load balancers / orchestrators to decide whether to route traffic here.
 * Mirrors the other QuikIT apps (e.g. apps/quiktrack/app/api/health/route.ts).
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      name: "quikchat",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      timestamp: new Date().toISOString(),
    },
  });
}
