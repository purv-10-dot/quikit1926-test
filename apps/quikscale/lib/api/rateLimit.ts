/**
 * Deprecated re-export shim.
 *
 * The rate limiter moved to @quikit/shared/rateLimit as part of P0-3
 * (docs/plans/P0-3-distributed-rate-limiter.md) so packages/auth and
 * the IdP's /api/oauth/token endpoint can share it.
 *
 * This file stays for one release cycle to avoid forcing every import in
 * quikscale to be rewritten in the same PR. Remove it (and retarget
 * imports at @quikit/shared/rateLimit) once the P0 wave has burned in.
 */
export * from "@quikit/shared/rateLimit";
