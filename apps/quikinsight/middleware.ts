import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikInsight middleware — SSO mode via QuikIT OAuth.
 * Unauthenticated users are redirected to /login → quikit OAuth.
 */
export const middleware = createMiddleware({
  loginRoute: "/login",
  // "/legal" prefix-matches /legal, /legal/privacy, /legal/terms, and any
  // future page nested under it — required by Google OAuth verification:
  // the privacy policy must be reachable without signing in.
  publicRoutes: ["/", "/login", "/auth-handoff", "/legal"],
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
