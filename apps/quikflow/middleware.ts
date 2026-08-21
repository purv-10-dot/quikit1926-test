import { createMiddleware } from "@quikit/auth/middleware";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { clearSessionCookies } from "@quikit/auth/session-cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * quikflow middleware.
 *
 * Wraps the @quikit/auth factory so unauthenticated traffic gets routed
 * through the launcher's hand-off flow instead of a same-domain login.
 * Cookies don't cross *.vercel.app subdomains, so the launcher mints a
 * short-lived JWT and `/auth-handoff` exchanges it for our session cookie.
 * Mirrors apps/quikscale/middleware.ts.
 *
 * `/` is a public marketing landing page (see
 * app/(marketing)/page.tsx) — 200 OK for everyone. The page component
 * itself server-redirects authed users to /dashboard, so logged-in users
 * never see the brochure.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikflow";

const factory = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/", "/login", "/invitations", "/auth-handoff", "/api/health"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
  enforceRemoteSessionValidation: process.env.NODE_ENV === "production",
});

export async function middleware(request: NextRequest) {
  const res = await factory(request);
  if (!res || (res.status !== 307 && res.status !== 308)) return res;

  const base = publicBaseUrl(request);
  const loc = res.headers.get("location") ?? "";
  let locUrl: URL;
  try {
    locUrl = new URL(loc, base);
  } catch {
    return res;
  }

  // Same-host redirect to /login* → send to central login, or fall back to
  // the local marketing landing page ("/") when no central auth host is
  // configured (local dev without QuikIT running).
  if (locUrl.host === new URL(base).host && locUrl.pathname.startsWith("/login")) {
    if (AUTH_URL) return NextResponse.redirect(new URL("/login", AUTH_URL));
    return NextResponse.redirect(new URL("/", base));
  }

  // Cross-host bounce to central auth with reason=session_expired → clear the
  // stale cookie before redirecting so the revoked session can't replay.
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

  // Cross-host redirect to launcher /apps (no-org user) → rewrite to the
  // launcher handoff handshake so the user lands back on quikflow with a
  // fresh cookie instead of stranded on the org picker.
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
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
