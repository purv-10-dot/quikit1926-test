import { createMiddleware } from "@quikit/auth/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * quiksocial middleware.
 *
 * Wraps the @quikit/auth factory so unauthenticated traffic gets routed
 * through the launcher's hand-off flow instead of a same-domain login.
 * Cookies don't cross *.vercel.app subdomains, so the launcher mints a
 * short-lived JWT and `/auth-handoff` exchanges it for our session cookie.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quiksocial";

const factoryMiddleware = createMiddleware({
  loginRoute: "/login",
  // No local org picker — no-org users are sent to the launcher /apps
  // via centralSelectOrgUrl (cross-domain handoff).
  publicRoutes: ["/login", "/invitations", "/auth-handoff"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});

export async function middleware(request: NextRequest) {
  // The public marketing landing lives at the exact root path. Let it
  // through unauthenticated. We special-case `pathname === "/"` instead of
  // adding "/" to publicRoutes because the factory matches public routes with
  // `pathname.startsWith(r)` — a "/" entry would make EVERY route public and
  // disable auth for the whole app. Authenticated users who hit "/" are sent
  // to /dashboard by the marketing page's own server-side session check. All
  // other routes keep their existing middleware-enforced auth gating.
  if (request.nextUrl.pathname === "/") {
    return NextResponse.next();
  }

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
  // Exclude framework + static asset routes from auth so they load for
  // anonymous visitors on the public landing. The trailing `.*\..*` skips
  // any path containing a file extension (the landing's logo PNGs, the
  // scrubbing MP4, the favicon /icon.svg, platform icons, etc.) — without it
  // the strict middleware redirects those static requests to login and they
  // 404 / show as broken images. Dashboard and other app routes are dotless,
  // so they still pass through the middleware and keep their auth gating.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
