import { createMiddleware } from "@quikit/auth/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * quikscale middleware.
 *
 * Behaviour:
 *   - `/`  → public marketing landing page (200 OK for everyone). The
 *           page component itself server-redirects authed users to
 *           /dashboard, so logged-in users never see the brochure.
 *   - `/dashboard`, `/kpi`, `/opsp`, … → auth required. Unauth users get
 *           sent to `/` (the landing). From there they click "Login" to
 *           reach https://authn.quikit.ai/login.
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
 */
const factory = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/", "/login", "/invitations", "/auth-handoff", "/api/health"],
});

export async function middleware(request: NextRequest) {
  const res = await factory(request);
  // Rewrite any same-host redirect to `/login*` → `/` (the marketing
  // landing). Cross-host redirects from the factory are left alone — they
  // already point at the central auth host.
  if (res && (res.status === 307 || res.status === 308)) {
    const loc = res.headers.get("location") ?? "";
    try {
      const locUrl = new URL(loc, request.url);
      const sameHost = locUrl.host === request.nextUrl.host;
      if (sameHost && locUrl.pathname.startsWith("/login")) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } catch {
      // non-URL location — leave the factory response as-is
    }
  }
  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|marketing/).*)"],
};
