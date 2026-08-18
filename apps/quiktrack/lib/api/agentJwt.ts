import { jwtDecrypt, type JWTPayload } from "jose";
import hkdf from "@panva/hkdf";

/**
 * Verification for the platform's agent JWT — the short-lived credential
 * Pravin's auth service mints for the AI Runtime (and other internal
 * services) to call into QuikTrack on a user's behalf.
 *
 * Distinct from `apiToken.ts` (a signed JWS the user's own browser/scripts
 * mint) and `withPatAuth.ts` (a long-lived, project-scoped PAT for external
 * coding-agent tools). This token is a JWE — encrypted, not signed — minted
 * entirely outside this app. QuikTrack only decrypts and validates it.
 *
 * Header is `{"alg":"dir","enc":"A256GCM"}` — identical to this app's own
 * NextAuth session cookie (see `app/auth-handoff/route.ts`), because the
 * auth service mints it the same way NextAuth mints a session: via
 * `next-auth/jwt`'s `EncryptJWT`/`encode()` conventions, not a bare
 * `jose.CompactEncrypt`. Critically, that means the AES key is NOT
 * `NEXTAUTH_SECRET`'s raw bytes — next-auth runs the secret through
 * HKDF-SHA256 first (see `node_modules/next-auth/jwt/index.js`,
 * `getDerivedEncryptionKey`) to derive the real 32-byte key. Decrypting with
 * the raw secret instead of the derived key fails silently on every real
 * token, so `getDerivedKey` below reproduces next-auth's derivation exactly
 * (empty salt, matching this app minting no salted NextAuth tokens either).
 */

const EXPECTED_ALG = "dir";
const EXPECTED_ENC = "A256GCM";
const NEXTAUTH_HKDF_INFO = "NextAuth.js Generated Encryption Key";
const NEXTAUTH_HKDF_SALT = "";

/**
 * Upper bound on `exp - iat`. Matches the auth service's stated mint cap, so a
 * legitimately longer-lived token IS rejected here — that is intended, and it
 * is why this is a named constant rather than an inline 900.
 *
 * These tokens carry no `sessionId` claim and so cannot be revoked mid-flight;
 * their age is the only bound there is. A verifier that trusts the issuer's
 * self-restraint is not verifying — QuikTrack cannot know if the mint cap
 * changes, or if a token ever arrives from somewhere else.
 *
 * The comparison below is `>`, not `>=`, and that is load-bearing rather than
 * stylistic: the auth service mints at exactly 900s (`exp - iat === 900`,
 * confirmed against a real payload), so `>=` would reject 100% of legitimate
 * traffic. A token AT the cap is valid.
 */
const MAX_AGENT_JWT_AGE_SECONDS = 900;

/**
 * Debug-only diagnostics. `verifyAgentJwt` returns `null` for eight distinct
 * failures and, without this, says nothing about which one — a claim-shape
 * mismatch (`id` where `sub` was expected) once cost both teams an afternoon
 * that logging the payload's KEY NAMES would have ended in five minutes.
 *
 * Off unless `ALLOW_AGENT_JWT_DEBUG === "true"`. An env flag rather than a
 * `NODE_ENV !== "production"` check on purpose: the failure this exists for
 * happens against a running deployment, so a gate that only opens in local dev
 * would be useless exactly when it is needed. Naming follows the app's one
 * existing precedent, ALLOW_EMAIL_DEBUG (app/api/debug/email-test/route.ts).
 *
 * NEVER pass a token, a payload, or a claim VALUE to this. Failure reasons and
 * key names only — see the call sites.
 */
function debugLog(reason: string): void {
  if (process.env.ALLOW_AGENT_JWT_DEBUG !== "true") return;
  // eslint-disable-next-line no-console
  console.debug(`[agent-jwt] ${reason}`);
}

/** `actingAs` values the auth service can mint. All non-"user" values collapse to `actorType: "agent"` at the call site — see withOrgAuth.ts. */
export type ActingAs = "user" | "ai_agent" | "platform_service" | "scheduled_job";

/** The three non-`"user"` values the auth service can mint. */
const AGENT_ACTING_AS: ReadonlySet<string> = new Set<ActingAs>([
  "ai_agent",
  "platform_service",
  "scheduled_job",
]);

export interface AgentJwtClaims {
  userId: string;
  orgId: string;
  actingAs: ActingAs;
  /**
   * Present for `ai_agent`, which the minter requires it for. Undefined is
   * legitimate for `platform_service` / `scheduled_job` — the minter only
   * enforces the field when `actingAs === "ai_agent"`
   * (`issue-agent-jwt/route.ts`), and both
   * docs/12-auth-service-integration-response.md §3 and QuikScale's RBAC doc
   * document it as optional. Requiring it here rejected every token those two
   * values can produce.
   */
  actingAgentId?: string;
}

async function getDerivedKey(): Promise<Uint8Array> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET missing: required to verify agent JWTs");
  }
  return hkdf("sha256", secret, NEXTAUTH_HKDF_SALT, NEXTAUTH_HKDF_INFO, 32);
}

// Intersected with JWTPayload so narrowing keeps the registered claims —
// `iat`/`exp` are read for the age bound after this guard passes.
function isAgentJwtPayload(payload: unknown): payload is JWTPayload & {
  sub: string;
  orgId: string;
  actingAs: ActingAs;
  actingAgentId?: string;
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;

  if (typeof p.sub !== "string" || p.sub.length === 0) return false;
  if (typeof p.orgId !== "string" || p.orgId.length === 0) return false;

  // Validate against the closed vocabulary rather than merely `!== "user"`.
  // The old check let ANY non-"user" string through and straight into audit
  // rows — `actingAs` is the whole human-vs-agent boundary here, since agent
  // JWTs share a signing key with ordinary session cookies.
  if (typeof p.actingAs !== "string" || !AGENT_ACTING_AS.has(p.actingAs)) {
    return false;
  }

  // Required for `ai_agent` (the minter guarantees it), optional for the other
  // two. Reject an empty string either way — a blank agent id is malformed,
  // not absent.
  if (p.actingAgentId !== undefined) {
    if (typeof p.actingAgentId !== "string" || p.actingAgentId.length === 0) {
      return false;
    }
  } else if (p.actingAs === "ai_agent") {
    return false;
  }

  return true;
}

/**
 * Decrypt and validate an agent JWT. Returns `null` on anything wrong —
 * malformed, wrong alg/enc, expired, over-age, missing claims — callers treat
 * `null` as unauthenticated. Never throws.
 *
 * Deliberately stateless: no caching of decrypted claims beyond the caller's
 * own request lifetime. These tokens cannot be revoked mid-flight (they carry
 * no `sessionId` claim and so never join the session store), which makes their
 * age the only bound there is — and it is ENFORCED here rather than assumed of
 * the minter: `exp - iat` must be ≤ MAX_AGENT_JWT_AGE_SECONDS, and a token
 * missing either claim is rejected. Re-verifying on every call, rather than
 * caching a decoded result, is load-bearing rather than merely simple.
 */
export async function verifyAgentJwt(token: string): Promise<AgentJwtClaims | null> {
  if (!token) {
    debugLog("empty token");
    return null;
  }
  try {
    const key = await getDerivedKey();
    // jwtDecrypt enforces exp/nbf itself (default clockTolerance 0s — not
    // widened; the age bound below is what actually keeps these tokens
    // short-lived) and rejects anything not matching the pinned alg/enc up
    // front.
    const { payload } = await jwtDecrypt(token, key, {
      contentEncryptionAlgorithms: [EXPECTED_ENC],
      keyManagementAlgorithms: [EXPECTED_ALG],
    });
    if (!isAgentJwtPayload(payload)) {
      // Key NAMES only, never values — this is what would have identified the
      // `id`-instead-of-`sub` mismatch immediately. See debugLog's contract.
      debugLog(
        `claim shape mismatch; keys=[${Object.keys(payload).sort().join(", ")}]`,
      );
      return null;
    }

    // Age bound. `exp` and `iat` are both REQUIRED: jwtDecrypt only enforces
    // `exp` when it is present, so a token omitting it would never expire, and
    // a token omitting `iat` would bypass the bound by having no start point.
    // Rejecting both closes those holes rather than describing them.
    const { iat, exp } = payload;
    if (typeof iat !== "number") {
      debugLog("iat claim missing — token age cannot be bounded");
      return null;
    }
    if (typeof exp !== "number") {
      debugLog("exp claim missing — token would never expire");
      return null;
    }
    if (exp - iat > MAX_AGENT_JWT_AGE_SECONDS) {
      debugLog(`token age exceeds the ${MAX_AGENT_JWT_AGE_SECONDS}s bound`);
      return null;
    }

    // TEMPORARY FALLBACK — the auth service mints the user identifier as `id`;
    // `sub` is the standard claim and the long-term fix on their side. Accept
    // both, and warn when the fallback fires so removal is evidence-driven
    // rather than something someone has to remember.
    //
    // REMOVAL CONDITION: this warning stops appearing in logs. Not a date.
    // When it does, delete this block, the `id` branch of isAgentJwtPayload,
    // and this comment.
    const sub = typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
    if (!sub) {
      // eslint-disable-next-line no-console
      console.warn(
        "[agent-jwt] Auth service minted `id` without `sub`; falling back to `id`. " +
          "When this warning stops appearing, delete the `id` fallback in lib/api/agentJwt.ts.",
      );
    }

    return {
      // The guard guarantees at least one of the two is a non-empty string.
      userId: sub ?? (payload.id as string),
      orgId: payload.orgId,
      actingAs: payload.actingAs,
      actingAgentId: payload.actingAgentId,
    };
  } catch (error: unknown) {
    // Decryption failure / wrong alg-enc / expired / malformed — all
    // unauthenticated. jose's `code` is a stable reason string
    // (ERR_JWT_EXPIRED, ERR_JWE_DECRYPTION_FAILED, ERR_JOSE_ALG_NOT_ALLOWED…),
    // never a claim value, so it is safe to surface.
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : error instanceof Error
          ? error.name
          : "unknown";
    debugLog(`decrypt/validate failed: ${code}`);
    return null;
  }
}
