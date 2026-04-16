import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikIT gateway middleware.
 *
 * ONLY enforces login (authenticated session required for non-public pages).
 * Does NOT enforce tenantId — the gateway serves login, org selection, and
 * the app launcher, all of which work without a selected org.
 *
 * Individual apps (QuikScale, Admin) enforce tenantId in their own middleware.
 */
export const middleware = createMiddleware({
  loginRoute: "/login",
  // NO selectOrgRoute — don't redirect to /select-org for missing tenantId
  postLoginRoute: "/apps",
  publicRoutes: [
    "/login",
    "/select-org",
    "/api/oauth/authorize",
    "/api/oauth/token",
    "/api/oauth/userinfo",
    "/api/oauth/jwks",
    "/.well-known/openid-configuration",
  ],
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
