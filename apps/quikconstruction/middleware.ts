import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikConstruction — OAuth client or central auth URL when configured.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;

export const middleware = createMiddleware({
  loginRoute: "/login",
  selectOrgRoute: "/select-org",
  publicRoutes: ["/login", "/select-org"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: AUTH_URL ? `${AUTH_URL}/select-org` : undefined,
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
