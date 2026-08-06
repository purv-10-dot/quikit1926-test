import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Signed `state` for the GitHub connect OAuth flow.
 *
 * The `state` parameter round-trips through GitHub's authorize + callback and
 * comes back attacker-influenceable, so it must be integrity-protected. We sign
 * a short-lived HS256 JWS binding the flow to the verified `userId` + `orgId`
 * that initiated it (resolved by `withOrgAuth` before the redirect). On callback
 * we verify the signature and expiry before trusting either id — this both
 * prevents CSRF (an attacker cannot forge a valid state) and stops cross-org
 * token confusion (the token we store is bound to the org that started the flow).
 *
 * Mirrors the signing approach in `lib/api/apiToken.ts`; the `typ: "gh_oauth"`
 * claim keeps these states from ever being replayed as API/session tokens.
 * Uses `jose` (already a dependency) — no new package.
 */

const STATE_TYP = "gh_oauth";

/** State lifetime in seconds. The consent round-trip is quick; keep it short. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface OAuthStateClaims {
  /** User who initiated the connect flow (JWT `sub`). */
  userId: string;
  /** Org the resulting installation/token will be bound to. */
  orgId: string;
  /**
   * Opaque per-request nonce, echoed by the caller so it can additionally pin
   * the state to a value stored in an httpOnly cookie (double-submit) if desired.
   */
  nonce: string;
}

function getSecretKey(): Uint8Array {
  const secret =
    process.env.GITHUB_OAUTH_STATE_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Surfaces as a 500 at sign/verify time rather than silently signing with
    // an empty key. NEXTAUTH_SECRET is set in every deployed environment.
    throw new Error(
      "GitHub OAuth state secret missing: set GITHUB_OAUTH_STATE_SECRET or NEXTAUTH_SECRET",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Sign a connect-flow `state`. Returns the compact JWS string. */
export async function signOAuthState(
  claims: OAuthStateClaims,
  ttlSeconds: number = OAUTH_STATE_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    typ: STATE_TYP,
    orgId: claims.orgId,
    nonce: claims.nonce,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(getSecretKey());
}

/**
 * Verify a connect-flow `state`. Returns the claims on success, or `null` when
 * the state is missing, malformed, expired, wrongly signed, or not a GitHub
 * OAuth state (`typ !== "gh_oauth"`). Never throws — callers treat `null` as an
 * invalid callback and abort the flow.
 */
export async function verifyOAuthState(
  state: string,
): Promise<OAuthStateClaims | null> {
  if (!state) return null;
  try {
    const { payload } = await jwtVerify(state, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (!isStatePayload(payload)) return null;
    return {
      userId: payload.sub as string,
      orgId: payload.orgId as string,
      nonce: (payload.nonce as string) ?? "",
    };
  } catch {
    // Expired / bad signature / malformed — all treated as an invalid state.
    return null;
  }
}

function isStatePayload(
  payload: JWTPayload,
): payload is JWTPayload & { orgId: string; nonce: string } {
  return (
    payload.typ === STATE_TYP &&
    typeof payload.sub === "string" &&
    payload.sub.length > 0 &&
    typeof payload.orgId === "string" &&
    payload.orgId.length > 0
  );
}
