import { NextResponse } from "next/server";
import { getJWKS } from "@/lib/oauth";

/**
 * GET /api/oauth/jwks — JSON Web Key Set endpoint
 *
 * Returns the public key(s) used to verify id_tokens issued by QuikIT.
 * Each OAuth client app fetches this to validate JWT signatures locally
 * without calling back to the IdP on every request.
 *
 * Standard endpoint: part of OIDC Discovery.
 */
export async function GET() {
  const jwks = await getJWKS();
  return NextResponse.json(jwks, {
    headers: {
      "Cache-Control": "public, max-age=3600", // cache for 1 hour
    },
  });
}
