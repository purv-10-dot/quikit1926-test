import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikScale middleware — SSO mode.
 *
 * No selectOrgRoute needed — tenantId comes from the QuikIT OAuth token.
 * Unauthenticated users hit /login which auto-triggers signIn("quikit").
 */
export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/select-org"],
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
