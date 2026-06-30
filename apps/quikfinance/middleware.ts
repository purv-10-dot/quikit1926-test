import { createMiddleware } from "@quikit/auth/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { portalForHost, isPortalPath } from "@/lib/portal/hosts";

/**
 * quikfinance middleware — composes two concerns:
 *
 *   1. Portal subdomain rewrite (ported from standalone QuikFinance):
 *      client/vendor/ca.quikit.* hosts are rewritten onto the
 *      /client | /vendor | /ca route groups so each external portal is
 *      addressable on its own host while sharing this one deployment. Portal
 *      hosts serve external users (clients/vendors/CAs) with their OWN auth,
 *      so they BYPASS the platform SSO gate entirely.
 *
 *   2. Platform SSO gating (matches quiktrack): on the main finance host,
 *      unauthenticated users are routed through the launcher's
 *      /apps?handoff=… handshake to acquire a cross-domain session cookie.
 *      `/auth-handoff` is public so the cookie-bridge can plant the cookie.
 *
 * Cookies don't cross *.vercel.app subdomains, so the launcher mints a
 * short-lived JWT and /auth-handoff exchanges it for our session cookie.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikfinance";

const factoryMiddleware = createMiddleware({
  loginRoute: "/login",
  // `/` = public marketing landing (the page server-redirects authed users to
  // /dashboard). No local org picker — no-org users are sent to the launcher
  // /apps via centralSelectOrgUrl (cross-domain handoff).
  publicRoutes: ["/", "/login", "/invitations", "/auth-handoff"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
  // Remote session validation hits the central auth service on EVERY protected
  // navigation (~50-100ms). Enforce in production only; dev relies on the
  // cryptographic JWT check + Redis revocation.
  enforceRemoteSessionValidation: process.env.NODE_ENV === "production",
});

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const portal = portalForHost(host);
  const { pathname } = request.nextUrl;

  // 1. Portal host → rewrite onto its route group and bypass the SSO gate.
  if (portal) {
    if (
      isPortalPath(pathname) ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/auth")
    ) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = `/${portal}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // 2. Main finance host → platform SSO gating + launcher handoff.
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
  // Excludes API, Next internals, favicon, and static image assets — the last
  // matters for portal hosts so /logo.png isn't rewritten to /client/logo.png.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
