import { jwtDecrypt } from "jose";
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

function isAgentJwtPayload(payload: unknown): payload is {
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
 * malformed, wrong alg/enc, expired, missing claims — callers treat `null`
 * as unauthenticated. Never throws.
 *
 * Deliberately stateless: no caching of decrypted claims beyond the caller's
 * own request lifetime. These tokens live ≤900s specifically because they
 * cannot be revoked mid-flight — the TTL is the only bound, so re-verifying
 * on every call (rather than caching a decoded result) is load-bearing, not
 * just simple.
 */
export async function verifyAgentJwt(token: string): Promise<AgentJwtClaims | null> {
  if (!token) return null;
  try {
    const key = await getDerivedKey();
    // jwtDecrypt enforces exp/nbf itself (default clockTolerance 0s — these
    // tokens are ≤900s TTL by design, no reason to widen it) and rejects
    // anything not matching the pinned alg/enc up front.
    const { payload } = await jwtDecrypt(token, key, {
      contentEncryptionAlgorithms: [EXPECTED_ENC],
      keyManagementAlgorithms: [EXPECTED_ALG],
    });
    if (!isAgentJwtPayload(payload)) return null;

    return {
      userId: payload.sub,
      orgId: payload.orgId,
      actingAs: payload.actingAs,
      actingAgentId: payload.actingAgentId,
    };
  } catch {
    // Decryption failure / wrong alg-enc / expired / malformed — all unauthenticated.
    return null;
  }
}
