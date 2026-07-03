import { NextResponse } from "next/server";

/**
 * GET /api/health — public liveness probe. No DB, no auth, no PII.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      name: "quikasset",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      timestamp: new Date().toISOString(),
    },
  });
}
