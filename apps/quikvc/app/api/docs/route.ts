import { NextResponse } from "next/server";

// Redirect target depends on runtime env — never prerender at build.
export const dynamic = "force-dynamic";

/**
 * GET /api/docs — redirects to the platform-wide Swagger UI hosted on QuikIT,
 * pre-filtered to the `app:quikvc` tag. See apps/quikit/app/api/docs/route.ts.
 */
export async function GET() {
  const quikitUrl =
    process.env.QUIKIT_URL ??
    (process.env.NODE_ENV === "production"
      ? (() => { throw new Error("QUIKIT_URL env var not set"); })()
      : "http://localhost:3000"); // prod-safety-allow: dev-only fallback, prod throws
  return NextResponse.redirect(`${quikitUrl}/api/docs#tag/app:quikvc`);
}
