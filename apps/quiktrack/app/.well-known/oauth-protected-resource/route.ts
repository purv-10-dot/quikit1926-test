import { NextRequest, NextResponse } from "next/server";


/**
 * RFC 9728 OAuth 2.0 Protected Resource Metadata for the QuikTrack MCP
 * endpoint. Unauthenticated by design (RFC 9728 requires this document be
 * publicly fetchable) — it only points a client at which authorization
 * server(s) to use, it grants nothing on its own. An OAuth-capable MCP
 * client (e.g. Claude Desktop) fetches this after a 401 with a
 * `resource_metadata` challenge (see `lib/api/withOrgAuth.ts`) to discover
 * that QuikTrack accepts tokens from the QuikIT launcher IdP.
 */
// A browser-based/Electron MCP client (e.g. Claude Desktop's connector UI)
// fetches this from a renderer context, which enforces CORS — see the same
// note on app/api/mcp/route.ts's CORS_HEADERS.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const quikitUrl = process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL;
  // req.nextUrl.origin is unreliable behind a reverse proxy/tunnel: Next.js
  // picks up X-Forwarded-Proto but not X-Forwarded-Host, so it can report
  // "https://localhost:3004" instead of the real public origin. Prefer the
  // app's own known public URL when set (same override pattern quikit uses
  // via resolveAppOrigin()) and only fall back to the request's origin for
  // plain local dev with no override configured.
  const selfUrl = process.env.NEXT_PUBLIC_QUIKTRACK_URL || req.nextUrl.origin;
  return NextResponse.json(
    {
      resource: `${selfUrl}/api/mcp`,
      authorization_servers: quikitUrl ? [quikitUrl] : [],
    },
    { headers: CORS_HEADERS },
  );
}
