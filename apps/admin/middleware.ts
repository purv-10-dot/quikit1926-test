import { createMiddleware } from "@quikit/auth/middleware";

/**
 * Org admin portal — central auth when NEXT_PUBLIC_AUTH_URL is set (shared JWT).
 * Non-admin members are redirected with reason=unauthorized.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;

export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/select-org", "/invitations"],
  requireAdmin: true,
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: AUTH_URL ? `${AUTH_URL}/select-org` : undefined,
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
