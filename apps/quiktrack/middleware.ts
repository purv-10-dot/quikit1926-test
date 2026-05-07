import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikTrack — central auth + org selection when NEXT_PUBLIC_AUTH_URL is set.
 *
 * orgId comes from the QuikIT OAuth token. Unauthenticated users are
 * forwarded to apps/auth (`NEXT_PUBLIC_AUTH_URL`); when a session has no
 * orgId yet, the launcher's /apps page handles selection.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;

export const middleware = createMiddleware({
  loginRoute: "/login",
  selectOrgRoute: "/select-org",
  publicRoutes: ["/login", "/select-org", "/invitations"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
