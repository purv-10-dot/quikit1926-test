import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikScale — central auth + org selection when NEXT_PUBLIC_AUTH_URL is set.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;

export const middleware = createMiddleware({
  loginRoute: "/login",
  selectOrgRoute: "/select-org",
  publicRoutes: ["/login", "/select-org"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  // /select-org retired — fall through to launcher /apps when token has no orgId.
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
