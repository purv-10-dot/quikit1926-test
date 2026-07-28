import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikHRMS — central auth via QuikIT. Unauthenticated users hit the local
 * /login page, which auto-triggers signIn("quikit") SSO. No local HRMS login.
 *
 * Public routes stay open for flows that are NOT QuikIT users:
 *  - /candidate-portal, /candidate-documents — external job applicants (token-based)
 *  - /interview-feedback — tokenised interviewer links
 */
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const APP_SLUG = "quikhrms";

// Local-dev escape hatch: when SSO isn't configured (no QuikIT URL) in a
// non-production build, skip central-auth enforcement entirely. Otherwise the
// middleware would redirect every page to /login → signIn("quikit") against a
// non-existent IdP and loop (ERR_TOO_MANY_REDIRECTS). In this mode the app
// relies on the header-based dev flow (withAuth's x-user-id/x-tenant-id) and
// the client AuthGuard renders without a session. Set NEXT_PUBLIC_QUIKIT_URL
// to exercise real SSO locally.
const DEV_BYPASS = process.env.NODE_ENV !== "production" && !QUIKIT_URL;

const centralMiddleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: [
    "/login",
    "/auth-handoff", // launcher hand-off — establishes the session, must not redirect
    "/candidate-portal",
    "/candidate-documents",
    "/interview-feedback",
    "/offer", // tokenised candidate offer accept/decline links
    "/doc-upload", // tokenised candidate onboarding document upload links
    "/policy-ack", // tokenised candidate policy / training acknowledgement links
    "/task-done", // tokenised assignee one-click task-complete links
    "/exit-ack", // tokenised employee policy re-acknowledge links (offboarding)
  ],
  postLoginRoute: "/dashboard",
  // Unauthenticated users go to the central auth login (bridged to the launcher
  // hand-off by the wrapper below). Required for the remote-validation block to
  // run at all (it needs authBaseUrl, derived from centralLoginUrl).
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  // When the token has no orgId, send the user to QuikIT's app launcher to
  // pick an org (mirrors quikscale; /select-org is retired).
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
  // Remote session validation (Redis TTL/revoke → session_expired) on every
  // protected nav in production only; dev relies on the JWT-callback Redis
  // soft-revocation. Explicit + identical across all apps (mirrors quiktrack).
  enforceRemoteSessionValidation: process.env.NODE_ENV === "production",
});

export async function middleware(req: NextRequest) {
  if (DEV_BYPASS) return NextResponse.next();
  // Public marketing landing — exact match only. (The shared factory now also
  // treats "/" as exact, but keeping this explicit short-circuit is harmless.)
  // The (marketing) page itself redirects authed users to /dashboard, so
  // logged-in visitors never see the brochure.
  if (req.nextUrl.pathname === "/") return NextResponse.next();
  // `req as never`: createMiddleware is typed against the root `next`'s
  // NextRequest, which differs from this app's next@15 symbol. Runtime shape is
  // identical; the cast only bridges the cross-version type drift.
  const res = await centralMiddleware(req as never);
  // Route unauthenticated traffic through the launcher hand-off (cross-domain
  // session bridge) instead of a bare central-login redirect — mirrors
  // quiktrack / quikscale. Only rewrites the central-login redirect.
  if (QUIKIT_URL && (res.status === 307 || res.status === 308)) {
    const dest = res.headers.get("location") ?? "";
    const launcherLogin = AUTH_URL ? `${AUTH_URL}/login` : "";
    if (launcherLogin && dest.startsWith(launcherLogin)) {
      const handoff = new URL("/apps", QUIKIT_URL);
      handoff.searchParams.set("handoff", APP_SLUG);
      handoff.searchParams.set("to", req.nextUrl.pathname + req.nextUrl.search);
      return NextResponse.redirect(handoff);
    }
  }
  return res;
}

export const config = {
  // Exclude API routes (protected by withAuth / token flows) and static assets.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
