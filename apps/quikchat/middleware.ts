import { createMiddleware } from "@quikit/auth/middleware";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { clearSessionCookies } from "@quikit/auth/session-cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * quikchat middleware.
 *
 * Wraps the @quikit/auth factory. Behaviour (mirrors quikscale — the canonical
 * OAuth-client pattern):
 *   - `/`  → public marketing landing (200 OK for everyone). The page
 *           server-redirects authed users to /dashboard.
 *   - `/dashboard`, … → auth required. Unauth users are sent to the central
 *           auth host's `/login` (centralLoginUrl) and, once authenticated,
 *           reach `/dashboard` where the layout's `requireAppAccess` runs. A
 *           user WITHOUT QuikChat access is redirected to `/?reason=no_app_access`
 *           and the landing shows the <AppAccessDeniedPopup /> — same flow as
 *           every other app.
 *   - `/auth-handoff` is public so the cross-domain cookie-bridge can plant the
 *           session cookie on this host.
 *
 * IMPORTANT: we must NOT blanket-rewrite the central-login redirect into
 * `${QUIKIT_URL}/apps?handoff=…`. That handshake only completes for apps the
 * user can already SEE in the launcher, so a user WITHOUT QuikChat access got
 * stranded on `/apps` instead of seeing the access-denied popup. Only the
 * factory's no-org launcher bounce is rewritten to the handshake (Case 3).
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikchat";

const factory = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/", "/login", "/auth-handoff"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
  // Remote session validation (Redis TTL/revoke → session_expired) on every
  // protected nav in production only; dev relies on the JWT-callback Redis
  // soft-revocation. Explicit + identical across all apps (mirrors quiktrack).
  enforceRemoteSessionValidation: process.env.NODE_ENV === "production",
});

export async function middleware(request: NextRequest) {
  const res = await factory(request);
  if (!res || (res.status !== 307 && res.status !== 308)) return res;

  // This host's own public origin, never the pod bind address `request.url`
  // resolves to behind the ingress. See @quikit/auth/public-url.
  const base = publicBaseUrl(request);

  const loc = res.headers.get("location") ?? "";
  let locUrl: URL;
  try {
    locUrl = new URL(loc, base);
  } catch {
    return res;
  }

  // Case 1: same-host redirect to /login* → rewrite to `/` (marketing landing).
  // Only reached when centralLoginUrl is unset (local-dev fallback).
  if (locUrl.host === new URL(base).host && locUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", base));
  }

  // Case 2: cross-host redirect to central auth login WITH reason=session_expired
  // (the factory's "your session was revoked" signal). Clear the stale NextAuth
  // cookie before bouncing — otherwise the next attempt replays the dead cookie.
  if (AUTH_URL) {
    let authOrigin: string | null = null;
    try {
      authOrigin = new URL(AUTH_URL).origin;
    } catch {
      authOrigin = null;
    }
    if (
      authOrigin &&
      locUrl.origin === authOrigin &&
      locUrl.searchParams.get("reason") === "session_expired"
    ) {
      return clearSessionCookies(NextResponse.redirect(locUrl));
    }
  }

  // Case 3: cross-host redirect to launcher /apps (no-org user). Rewrite to the
  // launcher handoff handshake so the user lands back on quikchat with a fresh
  // cookie instead of being stranded on the launcher's org picker. A suspended-org
  // bounce must land directly on the launcher (where its popup is shown), so it
  // is NOT rewritten.
  if (QUIKIT_URL) {
    let launcherOrigin: string | null = null;
    try {
      launcherOrigin = new URL(QUIKIT_URL).origin;
    } catch {
      launcherOrigin = null;
    }
    if (
      launcherOrigin &&
      locUrl.origin === launcherOrigin &&
      locUrl.pathname === "/apps" &&
      locUrl.searchParams.get("reason") !== "org_suspended"
    ) {
      const handoff = new URL("/apps", QUIKIT_URL);
      handoff.searchParams.set("handoff", APP_SLUG);
      handoff.searchParams.set("to", request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(handoff);
    }
  }

  return res;
}

export const config = {
  // The `.*\\..*` clause excludes any path containing a dot (static files in
  // /public: icon.svg, the logo PNG, etc.) so the auth factory doesn't gate
  // them and return HTML instead of the asset bytes. Mirrors quiktrack.
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|marketing/|.*\\..*).*)"],
};
