import { createMiddleware } from "@quikit/auth/middleware";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { clearSessionCookies } from "@quikit/auth/session-cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * quikscale middleware.
 *
 * Wraps the @quikit/auth factory so unauthenticated traffic gets routed
 * through the launcher's hand-off flow instead of a same-domain login.
 * Cookies don't cross *.vercel.app subdomains, so the launcher mints a
 * short-lived JWT and `/auth-handoff` exchanges it for our session cookie.
 *
 * Behaviour:
 *   - `/`  → public marketing landing page (200 OK for everyone). The
 *           page component itself server-redirects authed users to
 *           /dashboard, so logged-in users never see the brochure.
 *   - `/dashboard`, `/kpi`, `/opsp`, … → auth required. Unauth users get
 *           sent to the central auth host's `/login` (set via
 *           centralLoginUrl). Authed-no-org users get routed through the
 *           launcher `/apps?handoff=quikscale` handshake to acquire a
 *           cross-domain session cookie.
 *   - `/auth-handoff` is public so the cross-domain cookie-bridge from
 *           the auth host can plant the session cookie on this host.
 *
 * Why `loginRoute: "/login"` (a route that doesn't exist) plus a wrapper:
 *   the factory's `isLoginRoute = pathname.startsWith(loginRoute)` check
 *   matches EVERY path when `loginRoute === "/"` — that broke navigation
 *   to every dashboard module (authed users got bounced to /dashboard on
 *   each click because `isLoginRoute` evaluated true). Keeping the
 *   loginRoute as a unique sentinel and rewriting the bounce here is the
 *   safe pattern until the factory grows an exact-match option.
 *
 * Session enforcement: `centralLoginUrl` + `INTERNAL_SECRET` together
 * enable the factory's remote verify-token call against the central auth
 * host. That endpoint runs `verifyJWT` → Redis EXISTS, so TTL expiry,
 * admin revoke, or sibling-app signOut invalidates this app's session on
 * the next protected page nav. Without this, the JWT cookie was trusted
 * blindly until its own `exp` claim.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikscale";

const factory = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/", "/login", "/invitations", "/auth-handoff", "/api/health"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
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

  // Case 1: same-host redirect to /login* → rewrite to `/` (marketing
  // landing). Only reached when centralLoginUrl is unset (local-dev
  // fallback) since otherwise the factory points unauth users at the
  // cross-host central login.
  if (
    locUrl.host === new URL(base).host &&
    locUrl.pathname.startsWith("/login")
  ) {
    return NextResponse.redirect(new URL("/", base));
  }

  // Case 2: cross-host redirect to central auth login WITH
  // reason=session_expired (the factory's "your session was revoked"
  // signal). Clear the stale NextAuth cookie before bouncing — otherwise
  // the next attempt replays the same dead cookie and the factory's
  // loop-breaker (`_redirect_count>=3` → next()) would let the revoked
  // session through, undoing the revocation.
  if (AUTH_URL) {
    let authOrigin: string | null = null;
    try { authOrigin = new URL(AUTH_URL).origin; } catch { authOrigin = null; }
    if (
      authOrigin &&
      locUrl.origin === authOrigin &&
      locUrl.searchParams.get("reason") === "session_expired"
    ) {
      // Evict ALL NextAuth cookies (incl. __Secure-/__Host- with Secure set,
      // which a bare .delete() omits — the browser then ignores the deletion).
      return clearSessionCookies(NextResponse.redirect(locUrl));
    }
  }

  // Case 3: cross-host redirect to launcher /apps (no-org user). Rewrite
  // to the launcher handoff handshake so the user lands back on quikscale
  // with a fresh cookie instead of being stranded on the launcher's org
  // picker.
  if (QUIKIT_URL) {
    let launcherOrigin: string | null = null;
    try { launcherOrigin = new URL(QUIKIT_URL).origin; } catch { launcherOrigin = null; }
    if (
      launcherOrigin &&
      locUrl.origin === launcherOrigin &&
      locUrl.pathname === "/apps"
    ) {
      const handoff = new URL("/apps", QUIKIT_URL);
      handoff.searchParams.set("handoff", APP_SLUG);
      handoff.searchParams.set(
        "to",
        request.nextUrl.pathname + request.nextUrl.search,
      );
      return NextResponse.redirect(handoff);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
