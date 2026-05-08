import { createMiddleware } from "@quikit/auth/middleware";

/**
 * App middleware — SSO mode (matches admin/quikscale).
 *
 * orgId comes from the QuikIT OAuth token. Unauthenticated users hit /login
 * which auto-triggers signIn("quikit"). Don't roll your own auth here — use
 * the shared `createMiddleware` factory so all apps stay in sync.
 */
export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/select-org", "/invitations"],
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
