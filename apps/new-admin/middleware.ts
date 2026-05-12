import { createMiddleware } from "@quikit/auth/middleware";

/**
 * admin-next portal middleware — mirrors apps/admin/middleware.ts.
 * Non-admin members are redirected with reason=unauthorized.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;

export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/select-org", "/invitations"],
  requireAdmin: true,
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
