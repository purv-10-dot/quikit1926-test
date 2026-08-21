/**
 * Allowlist of services authorised to call internal auth endpoints
 * (`POST /api/auth/internal/issue-agent-jwt`, etc.). The `requestingService`
 * field on every internal request is checked against this set; anything else
 * gets a 403 FORBIDDEN.
 *
 * Adding a service: send a PR adding to this list. No auth-service deploy
 * required if you also import this constant into the endpoint that gates on
 * it (the endpoint reads the live module on each request).
 *
 * Why a hardcoded list and not env var: this is a security boundary. We want
 * the diff that broadens it to be reviewable in source control, not a silent
 * env change that bypasses code review.
 */
export const INTERNAL_SERVICE_ALLOWLIST = new Set<string>([
  "ai-runtime",
  "search",
  "comms",
  "launcher",
]);

/**
 * `iss` stamped on every agent JWT minted by
 * `POST /api/auth/internal/issue-agent-jwt`.
 *
 * Lives here rather than in the route so the minter and every future verifier
 * read the same string instead of hand-copying it — the `actingAs` vocabulary
 * is already restated in four places, and that duplication is what let the
 * `sub`/`id` mismatch survive undetected.
 *
 * Agent JWTs are minted with the same `NEXTAUTH_SECRET`-derived key as ordinary
 * session cookies, so claim shape — not key separation — is what distinguishes
 * the two. `iss` exists to make that boundary explicit rather than implicit.
 *
 * NOTE: emitted only, not yet enforced. Nothing minted before this claim shipped
 * carries it, so a verifier that *requires* `iss` would reject in-flight tokens.
 * Enforce only after emit has been observed in logs (emit → verify-and-log →
 * enforce), and never inside the shared session path: `verifyJWT`/`getToken`
 * serves session cookies too, and no session cookie carries `iss`.
 */
export const AGENT_JWT_ISSUER = "auth-service-internal";

export type InternalService = "ai-runtime" | "search" | "comms" | "launcher";

export function isAllowedInternalService(service: string): boolean {
  return INTERNAL_SERVICE_ALLOWLIST.has(service);
}
