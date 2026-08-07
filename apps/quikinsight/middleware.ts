import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikInsight middleware — SSO mode via QuikIT OAuth.
 * Unauthenticated users are redirected to /login → quikit OAuth.
 */
export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/", "/login", "/auth-handoff"],
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
