/**
 * Verifies an OAuth access token issued by the QuikIT launcher's OIDC IdP
 * (`apps/quikit`), for MCP clients whose connector UI only speaks OAuth
 * (e.g. Claude Desktop) rather than a pasteable Personal Access Token.
 *
 * quikit's access tokens are opaque (`qk_...`), not JWTs — only its
 * `id_token` is a signed JWT. There is no local JWKS check possible here;
 * verification means calling quikit's own `GET /api/oauth/userinfo` with the
 * token as a Bearer credential, the same way any OAuth resource server
 * validates an opaque token against its issuing authorization server.
 */

const OAUTH_TOKEN_PREFIX = "qk_";

export interface OAuthUserClaims {
  /** User id (userinfo `sub`). */
  userId: string;
  /** Org the token's session was active in (userinfo `tenant_id`). */
  orgId: string;
  /** User email, carried for convenience / audit. */
  email: string;
}

/** True if `token` has the shape of a quikit-issued OAuth access token. */
export function looksLikeOAuthAccessToken(token: string): boolean {
  return token.startsWith(OAUTH_TOKEN_PREFIX);
}

function getQuikitUrl(): string | undefined {
  return process.env.QUIKIT_URL ?? process.env.QUIKIT_ISSUER_URL;
}

/**
 * Verify an OAuth access token against quikit's userinfo endpoint. Returns
 * the mapped claims on success, or `null` when the token is missing,
 * rejected by quikit, or the response is missing a required claim. Never
 * throws — callers treat `null` as 401, same discipline as `verifyApiToken`.
 */
export async function verifyOAuthAccessToken(
  token: string,
): Promise<OAuthUserClaims | null> {
  if (!token) return null;
  const quikitUrl = getQuikitUrl();
  if (!quikitUrl) return null;

  try {
    const res = await fetch(`${quikitUrl}/api/oauth/userinfo`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const claims = (await res.json()) as {
      sub?: unknown;
      tenant_id?: unknown;
      email?: unknown;
    };
    if (typeof claims.sub !== "string" || claims.sub.length === 0) return null;
    if (typeof claims.tenant_id !== "string" || claims.tenant_id.length === 0) return null;

    return {
      userId: claims.sub,
      orgId: claims.tenant_id,
      email: typeof claims.email === "string" ? claims.email : "",
    };
  } catch {
    // Network failure / malformed response — treated as unauthenticated
    // rather than a 500, same as any other failed live token check here.
    return null;
  }
}
