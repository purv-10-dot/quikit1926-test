/**
 * Central-auth login URL for the public marketing CTAs.
 *
 * The in-app `/login` page runs `signIn("quikit")` for users bounced out of a
 * protected route. The landing CTAs are different: a first-time visitor has no
 * app context, so we send them to the central QuikAuth login carrying a
 * `callbackUrl` that returns them to HRMS's `/dashboard` after sign-in — via the
 * auth host's `/api/post-login` → HRMS `/auth-handoff` cookie bridge. Without
 * this, the central login falls back to its default post-login destination
 * (the launcher `/apps` grid), which is why logging in from the HRMS landing
 * used to dump the user on /apps instead of returning them to HRMS.
 *
 * This inlines `@quikit/shared/login-url`'s `buildLoginUrl` rather than
 * importing it — HRMS intentionally avoids `@quikit/shared`/`@quikit/auth`
 * imports because their entrypoints pull in `@quikit/database` (a different
 * Prisma major than HRMS's own; see lib/auth.ts header).
 *
 * Cross-origin returns require the auth host to allow-list the HRMS origin via
 * `AUTH_ALLOWED_RETURN_ORIGINS` (dev: http://localhost:3009; prod: the HRMS
 * domain). Otherwise post-login rejects the return and falls back to /apps.
 */

// Literal env access so the Next/webpack DefinePlugin can statically inline the
// value in this client-imported module (dynamic `process.env[name]` is not
// replaced — see the shared env.ts rationale).
const AUTH_URL = (process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001").replace(/\/$/, "");
const APP_URL = (process.env.NEXT_PUBLIC_QUIKHRMS_URL ?? "http://localhost:3009").replace(/\/$/, "");
const POST_LOGIN_PATH = "/dashboard";

function buildLoginHref(): string {
  const finalCallback = `${APP_URL}${POST_LOGIN_PATH}`;

  const sameOrigin = (() => {
    try {
      return new URL(finalCallback).origin === AUTH_URL;
    } catch {
      return false;
    }
  })();

  // Same-origin callbacks don't need the cross-domain cookie bridge.
  if (sameOrigin) {
    return `${AUTH_URL}/login?callbackUrl=${encodeURIComponent(finalCallback)}`;
  }

  // Route through the auth host's post-login bridge so the session cookie is
  // minted on HRMS's own host (cookies are host-scoped) before landing on /hrms.
  const bridge = `${AUTH_URL}/api/post-login?callbackUrl=${encodeURIComponent(finalCallback)}`;
  return `${AUTH_URL}/login?callbackUrl=${encodeURIComponent(bridge)}`;
}

export const LOGIN_HREF = buildLoginHref();
