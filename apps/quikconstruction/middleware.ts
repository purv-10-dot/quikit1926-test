import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikConstruction middleware — same pattern as admin app.
 * When QUIKIT_URL + client creds are set, auth runs in OAuth2-client mode
 * (session bridged from QuikIT launcher); otherwise falls back to direct
 * credentials login against the shared User table.
 */
export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/select-org"],
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
