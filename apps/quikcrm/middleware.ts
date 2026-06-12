import { createMiddleware } from "@quikit/auth/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * quikcrm middleware.
 *
 * Wraps the @quikit/auth factory so unauthenticated traffic gets routed
 * through the launcher's hand-off flow instead of a same-domain login.
 * Cookies don't cross *.vercel.app subdomains, so the launcher mints a
 * short-lived JWT and `/auth-handoff` exchanges it for our session cookie.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikcrm";

const factoryMiddleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: [
    "/",
    "/login",
    "/invitations",
    "/auth-handoff",
    "/api/health",
    "/api/telephony/webhook",
    "/api/webhooks",
    "/portal",
    "/api/public",
  ],
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
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|marketing/).*)"],
};
