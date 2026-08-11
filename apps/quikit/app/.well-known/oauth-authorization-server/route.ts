import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { oauthCorsPreflight, OAUTH_CORS_HEADERS } from "@/lib/oauth";

export function OPTIONS(): Response {
  return oauthCorsPreflight();
}

/**
 * GET /.well-known/oauth-authorization-server
 *
 * RFC 8414 OAuth 2.0 Authorization Server Metadata. Per the MCP Authorization
 * spec, MCP clients try this well-known path BEFORE falling back to
 * /.well-known/openid-configuration when discovering an authorization server
 * whose issuer URL has no path component — it must exist and be reachable
 * without a session, or client-side discovery fails before it ever reaches
 * the (already-working) OIDC discovery document.
 *
 * Returns the same metadata document as openid-configuration/route.ts —
 * RFC 8414 §2 permits additional metadata fields, so serving one shared
 * shape at both well-known paths is spec-compliant and keeps the two
 * discovery documents from silently drifting apart.
 */
export async function GET(request: NextRequest) {
  const issuer = process.env.NEXTAUTH_URL ?? request.nextUrl.origin;

  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/api/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
      jwks_uri: `${issuer}/api/oauth/jwks`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "email", "tenant"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "none",
      ],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      claims_supported: [
        "sub",
        "email",
        "email_verified",
        "name",
        "given_name",
        "family_name",
        "picture",
        "tenant_id",
        "role",
      ],
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        ...OAUTH_CORS_HEADERS,
      },
    },
  );
}
