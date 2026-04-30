import { NextResponse } from "next/server";

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
  const quikitUrl = process.env.QUIKIT_URL ?? "http://localhost:3000";
  return NextResponse.redirect(`${quikitUrl}/api/docs#tag/app:quikscale`);
}
