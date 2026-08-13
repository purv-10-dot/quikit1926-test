import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddleware } from "@quikit/auth/middleware";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { clearSessionCookies } from "@quikit/auth/session-cookies";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikcrmexpress";

const factoryMiddleware = createMiddleware({
  loginRoute: "/login",
  // "/" is the public marketing landing page (app/(marketing)/page.tsx). It
  // self-redirects authenticated users to /dashboard, so it must reach the
  // route rather than be bounced to central login — same as quiktrack,
  // quikscale and quikinfra.
  //
  // "/portal" is the customer-facing quote portal: recipients follow a signed
  // token link and are never QuikIT users. It was missing here, so every quote
  // link 302'd to login and the feature could not work.
  //
  // "/select-org" and "/invitations" were listed but no such routes exist in
  // this app (org selection lives on the launcher via centralSelectOrgUrl).
  publicRoutes: [
    "/",
    "/login",
    "/auth-handoff",
    "/portal",
    "/api/public",
    "/api/health",
    "/api/telephony/webhook",
  ],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
  enforceRemoteSessionValidation: process.env.NODE_ENV === "production",
});

/**
 * Wraps the shared auth middleware to handle the three redirect cases the
 * factory alone gets wrong for a launcher-integrated app. Mirrors
 * quikscale/middleware.ts and quikchat/middleware.ts.
 *
 * This app previously exported the bare factory, which meant:
 *   - Case 2 — a revoked session's stale cookie was never evicted. The factory
 *     bounces to the auth host with `reason=session_expired`, but the cookie
 *     survives, replays, and once `_redirect_count >= 3` the factory's own
 *     loop-breaker calls next() — letting the revoked session through.
 *   - Case 3 — deep-linking into /dashboard/... without a usable cookie
 *     bounced to the launcher's /apps with no handoff params, so the user
 *     landed on the org picker instead of being returned to the path they
 *     asked for.
 *
 * Deliberately Variant B (quikscale/quikchat), NOT the simpler quiktrack
 * variant that rewrites every central-login bounce: this app is access-gated
 * and its "/" renders <AppAccessDeniedPopup />, so a user without access must
 * be allowed to reach the landing page rather than be pushed to /apps.
 * `org_suspended` is likewise exempted so the launcher can show its own
 * suspension notice.
 */
export async function middleware(request: NextRequest) {
  const res = await factoryMiddleware(request);
  if (!res || (res.status !== 307 && res.status !== 308)) return res;

  const base = publicBaseUrl(request);
  const loc = res.headers.get("location") ?? "";
  let locUrl: URL;
  try {
    locUrl = new URL(loc, base);
  } catch {
    return res;
  }

  // Case 1 — same-host bounce to /login. Only reachable when centralLoginUrl is
  // unset (local dev); send the user to the public landing page instead.
  if (locUrl.host === new URL(base).host && locUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", base));
  }

  // Case 2 — session expired: evict the stale cookie on the way out.
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

  // Case 3 — launcher bounce: carry the handshake so the launcher can mint a
  // handoff token and return the user to the path they originally requested.
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
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
