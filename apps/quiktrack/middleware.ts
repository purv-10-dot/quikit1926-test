import { createMiddleware } from "@quikit/auth/middleware";
import { publicBaseUrl } from "@quikit/auth/public-url";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
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
      // Cross-org deep link from a signed-out click: tell the launcher which
      // org to select before it mints the hand-off token, so the session lands
      // on the org that owns the record instead of the user's default one.
      const deepLinkOrg = request.nextUrl.searchParams.get("org");
      if (deepLinkOrg) handoff.searchParams.set("org", deepLinkOrg);
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

  // Cross-org deep link. Notification emails link to `/browse/<KEY>?org=<orgId>`
  // (see lib/email/sendEmail.ts). The session carries exactly one active org, so
  // a recipient who belongs to several orgs clicks that link in whichever org
  // they last opened the app in — and every org-scoped lookup on the page misses
  // when it isn't the org the record lives in (the "Something went wrong" 404).
  // Hand the request to /api/session/switch-org, which validates membership +
  // entitlement, re-mints the session cookie on the named org and redirects back
  // to this path (minus `org`). Runs AFTER the auth factory, so an unauthenticated
  // user still goes through login/handoff first — `?org=` survives on the
  // callbackUrl and this check fires on the way back in.
  const orgParam = request.nextUrl.searchParams.get("org");
  if (orgParam) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const userId = token?.id ?? token?.sub;
    if (userId && token?.orgId !== orgParam) {
      const base = publicBaseUrl(request);
      const dest = new URL(request.nextUrl.pathname + request.nextUrl.search, base);
      dest.searchParams.delete("org");
      const target = new URL("/api/session/switch-org", base);
      target.searchParams.set("orgId", orgParam);
      target.searchParams.set("to", `${dest.pathname}${dest.search}`);
      const redirect = NextResponse.redirect(target);
      redirect.headers.set("Content-Security-Policy", csp);
      return redirect;
    }
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
  // The `.*\\..*` clause excludes any path containing a dot (i.e. a static
  // file in /public — the marketing landing serves hero/logo/gradient PNGs
  // from the site root via plain <img> and CSS url(), not next/image).
  // Without it the auth factory intercepts every image request and redirects
  // it, so the browser gets HTML instead of image bytes. Mirrors quikscale.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|marketing/|.*\\..*).*)"],
};
