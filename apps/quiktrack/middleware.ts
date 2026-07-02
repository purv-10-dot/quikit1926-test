import { createMiddleware } from "@quikit/auth/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildCsp, generateNonce } from "@/lib/csp";

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
  // Remote session validation hits the central auth service (/api/verify-token)
  // on EVERY protected navigation — uncached, ~50-100ms per page load against a
  // second dev server. In local dev that round-trip dominates navigation
  // latency, and the JWT callback's Redis soft-revocation already covers token
  // invalidation. So enforce the remote check in production only; dev still has
  // the cryptographic JWT check + Redis revocation path.
  enforceRemoteSessionValidation: process.env.NODE_ENV === "production",
});

export async function middleware(request: NextRequest) {
  // SEC-06: per-request CSP nonce. Build it up-front so every return path below
  // (redirects, handoff, pass-through) carries the policy.
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

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
      const redirect = NextResponse.redirect(handoff);
      redirect.headers.set("Content-Security-Policy", csp);
      return redirect;
    }
  }

  // Redirect responses just get the CSP header — they render no HTML here.
  if (res.status === 307 || res.status === 308 || res.headers.has("location")) {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  // Pass-through (the page will render): re-issue `next()` with the nonce on the
  // *request* headers so Next.js stamps it onto its inline bootstrap scripts,
  // and expose it via `x-nonce` for server components (marketing JSON-LD). Carry
  // over any cookies the auth factory set (e.g. redirect-counter cleanup).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const cookie of res.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|marketing/).*)"],
};
