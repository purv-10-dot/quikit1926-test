/**
 * Canonical auth URLs — use from middleware, RSC guards, and client login
 * so redirect targets stay consistent.
 */
export const AUTH_LOGIN_PATH = "/login";
export const AUTH_POST_LOGIN_PATH = "/dashboard";

/** Clears the NextAuth session cookie, then lands on `callbackPath`. */
export function authSignOutUrl(callbackPath: string = AUTH_LOGIN_PATH): string {
  return `/api/auth/signout?callbackUrl=${encodeURIComponent(callbackPath)}`;
}

type JwtPayload = {
  sub?: unknown;
  orgId?: unknown;
} | null;

/** Matches server-side `readSession()` (requires user id + tenant org). */
export function hasCompleteAuthJwt(token: JwtPayload): boolean {
  if (!token) return false;
  const sub = token.sub;
  const orgId = token.orgId;
  return (
    typeof sub === "string" &&
    sub.length > 0 &&
    typeof orgId === "string" &&
    orgId.length > 0
  );
}
