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
  ],
  postLoginRoute: "/dashboard",
  // When the token has no orgId, send the user to QuikIT's app launcher to
  // pick an org (mirrors quikscale; /select-org is retired).
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});

export function middleware(req: NextRequest) {
  if (DEV_BYPASS) return NextResponse.next();
  // Public marketing landing — exact match only. It can't go in publicRoutes
  // because the factory matches those with startsWith(), and "/" would make
  // every route public. The (marketing) page itself redirects authed users
  // to /dashboard, so logged-in visitors never see the brochure.
  if (req.nextUrl.pathname === "/") return NextResponse.next();
  // `req as never`: createMiddleware is typed against the root `next`'s
  // NextRequest, which differs from this app's next@15 symbol. Runtime shape is
  // identical; the cast only bridges the cross-version type drift.
  return centralMiddleware(req as never);
}

export const config = {
  // Exclude API routes (protected by withAuth / token flows) and static assets.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
