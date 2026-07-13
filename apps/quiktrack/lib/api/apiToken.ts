import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Programmatic API access tokens for external Swagger/Scalar consumers.
 *
 * These are deliberately DISTINCT from the NextAuth session JWTs the browser
 * app uses:
 *   - signed as a plain HS256 JWS (readable by the client, unlike NextAuth's
 *     encrypted JWE session cookie),
 *   - carry a `typ: "api"` claim so a session token can never be replayed as an
 *     API token and vice-versa,
 *   - signed with a dedicated `API_TOKEN_SECRET` when provided, falling back to
 *     `NEXTAUTH_SECRET` so the feature works out of the box in every
 *     environment that already has NextAuth configured.
 *
 * The token binds the user to the org that was active at mint time. Live
 * membership is re-checked on every request by `withOrgAuth`, so a revoked or
 * suspended user loses access within the token's short lifetime regardless of
 * what the token still claims.
 */

/** Marker claim distinguishing API tokens from session tokens. */
const API_TOKEN_TYP = "api";

/** Default token lifetime in seconds (1 hour). */
export const API_TOKEN_TTL_SECONDS = 60 * 60;

export interface ApiTokenClaims {
  /** User id (JWT `sub`). */
  userId: string;
  /** Org the token is scoped to. */
  orgId: string;
  /** User email, carried for convenience / audit. */
  email: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.API_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Surfaces as a 500 at mint/verify time rather than silently signing with
    // an empty key. Both envs are set in every deployed environment.
    throw new Error(
      "API token secret missing: set API_TOKEN_SECRET or NEXTAUTH_SECRET",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Mint a signed API access token. Returns the compact JWS string. */
export async function signApiToken(
  claims: ApiTokenClaims,
  ttlSeconds: number = API_TOKEN_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    typ: API_TOKEN_TYP,
    orgId: claims.orgId,
    email: claims.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(getSecretKey());
}

/**
 * Verify an API access token. Returns the claims on success, or `null` when
 * the token is missing, malformed, expired, wrongly signed, or not an API
 * token (`typ !== "api"`). Never throws — callers treat `null` as 401.
 */
export async function verifyApiToken(
  token: string,
): Promise<ApiTokenClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (!isApiPayload(payload)) return null;
    return {
      userId: payload.sub as string,
      orgId: payload.orgId as string,
      email: (payload.email as string) ?? "",
    };
  } catch {
    // Expired / bad signature / malformed — all treated as unauthenticated.
    return null;
  }
}

function isApiPayload(
  payload: JWTPayload,
): payload is JWTPayload & { orgId: string } {
  return (
    payload.typ === API_TOKEN_TYP &&
    typeof payload.sub === "string" &&
    payload.sub.length > 0 &&
    typeof payload.orgId === "string" &&
    payload.orgId.length > 0
  );
}

/** Extract a bearer token from an Authorization header. Returns null if absent. */
export function bearerFromHeader(
  authorization: string | null | undefined,
): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1].trim() : null;
}
