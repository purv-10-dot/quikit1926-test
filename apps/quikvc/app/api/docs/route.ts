import { NextResponse } from "next/server";

/**
 * GET /api/docs — redirects to the platform-wide Swagger UI hosted on QuikIT,
 * pre-filtered to the `app:quikvc` tag. See apps/quikit/app/api/docs/route.ts.
 */
export async function GET() {
  const quikitUrl = process.env.QUIKIT_URL ?? "http://localhost:3000";
  return NextResponse.redirect(`${quikitUrl}/api/docs#tag/app:quikvc`);
}
