import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { createMiddleware } from "@quikit/auth/middleware";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { clearSessionCookies } from "@quikit/auth/session-cookies";

/**
 * Roles allowed to reach /settings/* (user management, workflows, roles).
 * Edge runtime can't import the full RBAC module, so the set is duplicated
 * here.
 */
const SETTINGS_ADMIN_ROLES = new Set(["super_admin", "admin", "org_admin"]);

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikinfra";

/**
 * Every request gets a correlation ID, forwarded to handlers via
 * `x-request-id` and echoed back on the response. Used by the logger,
 * response envelopes, and audit rows for cross-system tracing.
 */
function generateRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  let b64 = btoa(bin);
  b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `req_${b64}`;
}

const sharedMiddleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/invite", "/auth-handoff", "/api/auth"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});

export async function middleware(request: NextRequest) {
  // ── Request ID / correlation ID ──────────────────────────────────
  const incoming =
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    null;
  const requestId = incoming ?? generateRequestId();

  const forwarded = new Headers(request.headers);
  forwarded.set("x-request-id", requestId);

  // ── API routes: pass through with headers only (no auth redirect) ─
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const res = NextResponse.next({ request: { headers: forwarded } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // ── Public marketing landing at "/" — render without auth. Exact-match
  //    only (not a prefix via publicRoutes, which would make every route
  //    public under the shared middleware's startsWith check). The page
  //    server-redirects authed users to /dashboard.
  if (request.nextUrl.pathname === "/") {
    const res = NextResponse.next({ request: { headers: forwarded } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // ── Settings role gate (runs before delegating to the shared mw) ─
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = request.nextUrl;
  if (token && pathname.startsWith("/settings")) {
    const roleKey =
      (token as { roleKey?: string }).roleKey ??
      (token as { membershipRole?: string }).membershipRole;
    if (!roleKey || !SETTINGS_ADMIN_ROLES.has(roleKey)) {
      // Build on this host's public origin, never the pod bind address that
      // `request.url` resolves to behind the ingress. See @quikit/auth/public-url.
      const res = NextResponse.redirect(new URL("/dashboard", publicBaseUrl(request)));
      res.headers.set("x-request-id", requestId);
      return res;
    }
  }

  // Delegate auth-gate + central-login redirect to the shared middleware.
  const res = await sharedMiddleware(request);

  // Cookies don't cross *.vercel.app subdomains (or localhost ports), so
  // intercept any redirect to AUTH_URL/login and route it through the
  // launcher's /apps?handoff=… handshake instead. Mirrors quiktrack /
  // quikscale / quiksocial.
  if (QUIKIT_URL && (res.status === 307 || res.status === 308)) {
    const dest = res.headers.get("location") ?? "";
    const launcherLogin = AUTH_URL ? `${AUTH_URL}/login` : "";
    if (launcherLogin && dest.startsWith(launcherLogin)) {
      const handoff = new URL("/apps", QUIKIT_URL);
      handoff.searchParams.set("handoff", APP_SLUG);
      // Don't pass auth-flow-internal paths as `to` — landing back on /login
      // or /auth-handoff after a successful re-handshake would just loop. If
      // the user was bounced through an auth-internal path, drop them on `/`.
      const pn = request.nextUrl.pathname;
      const isAuthInternal =
        pn === "/login" ||
        pn === "/auth-handoff" ||
        pn.startsWith("/api/auth");
      handoff.searchParams.set(
        "to",
        isAuthInternal ? "/" : pn + request.nextUrl.search,
      );
      // Evict stale NextAuth cookies before re-handshaking. Replacing the
      // factory's redirect here would otherwise drop its Set-Cookie deletions;
      // a successful handoff re-mints a fresh session cookie afterwards anyway.
      const handoffRes = clearSessionCookies(NextResponse.redirect(handoff));
      handoffRes.headers.set("x-request-id", requestId);
      return handoffRes;
    }
  }

  if (res && res.headers.get("location")) {
    res.headers.set("x-request-id", requestId);
    return res;
  }
  const passthrough = NextResponse.next({ request: { headers: forwarded } });
  passthrough.headers.set("x-request-id", requestId);
  return passthrough;
}

// Matcher covers API routes too (for the request-id header) but skips
// static assets and Next internals.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|marketing/).*)"],
};
