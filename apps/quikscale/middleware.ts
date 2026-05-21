import { createMiddleware } from "@quikit/auth/middleware";

/**
 * quikscale middleware.
 *
 * Behaviour:
 *   - `/`  → public marketing landing page (200 OK for everyone). The
 *           page component itself server-redirects authed users to
 *           /dashboard, so logged-in users never see the brochure.
 *   - `/dashboard`, `/kpi`, `/opsp`, … → auth required. Unauth users get
 *           sent to `/` (the landing). From there they click "Login" to
 *           reach https://quikauth.quikit.ai/login.
 *   - `/login` route still exists in the app (legacy redirect target);
 *           kept in publicRoutes so it doesn't loop.
 *
 * Previously this middleware did a cross-domain handoff to the launcher
 * (`/apps?handoff=quikscale`) when an unauth user hit a protected route.
 * That made quikscale.quikit.ai/ unusable as a public surface. Now the
 * landing page IS the unauth fallback — same-domain, no JWT round-trip.
 */
export const middleware = createMiddleware({
  // Unauth users hitting protected routes land on the marketing page.
  loginRoute: "/",
  publicRoutes: ["/", "/login", "/invitations", "/auth-handoff", "/api/health"],
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|marketing/).*)"],
};
