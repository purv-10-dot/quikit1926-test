import { createMiddleware } from "@quikit/auth/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * quiktrack middleware.
 *
 * Behaviour:
 *   - `/`  → public marketing landing page (200 OK for everyone). The page
 *           component itself server-redirects authed users to /dashboard,
 *           so logged-in users never see the brochure.
 *   - `/dashboard`, `/spaces`, … → auth required. Unauth users get routed
 *           through the launcher's /apps?handoff=… handshake to acquire a
 *           cross-domain session cookie.
 *   - `/auth-handoff` is public so the cross-domain cookie-bridge from the
 *           auth host can plant the session cookie on this host.
 *
 * Cookies don't cross *.vercel.app subdomains, so the launcher mints a
 * short-lived JWT and `/auth-handoff` exchanges it for our session cookie.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quiktrack";

const factoryMiddleware = createMiddleware({
  loginRoute: "/login",
  // No local org picker — no-org users are sent to the launcher /apps
  // via centralSelectOrgUrl (cross-domain handoff). `/` is public so the
  // marketing landing renders without auth.
  // `/share` = public shared-doc links (no login). Safe as a prefix: no other
  // route starts with `/share`.
  publicRoutes: ["/", "/login", "/invitations", "/auth-handoff", "/share"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});

export async function middleware(request: NextRequest) {
  const res = await factoryMiddleware(request);
  if (QUIKIT_URL && (res.status === 307 || res.status === 308)) {
    const dest = res.headers.get("location") ?? "";
    const launcherLogin = AUTH_URL ? `${AUTH_URL}/login` : "";
    if (launcherLogin && dest.startsWith(launcherLogin)) {
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
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|marketing/).*)"],
};
