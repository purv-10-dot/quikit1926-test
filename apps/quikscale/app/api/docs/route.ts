import { NextResponse } from "next/server";

// Redirect target depends on runtime env — never prerender at build.
export const dynamic = "force-dynamic";

/**
 * GET /api/docs
 *
 * QuikScale routes are documented in the platform-wide combined OpenAPI
 * spec hosted by the QuikIT launcher. This endpoint redirects there with
 * the `app:quikscale` filter pre-applied.
 *
 * The platform spec covers all 5 apps; filter by tag to scope.
 *
 * URL resolution:
 *   - Production: QUIKIT_URL env var (set in Vercel)
 *   - Local dev:  defaults to http://localhost:3000
 */
export async function GET() {
  const quikitUrl =
    process.env.QUIKIT_URL ??
    (process.env.NODE_ENV === "production"
      ? (() => { throw new Error("QUIKIT_URL env var not set"); })()
      : "http://localhost:3000"); // prod-safety-allow: dev-only fallback, prod throws
  return NextResponse.redirect(`${quikitUrl}/api/docs#tag/app:quikscale`);
}
