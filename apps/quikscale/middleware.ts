import { createMiddleware } from "@quikit/auth/middleware";

const QUIKIT_URL = process.env.QUIKIT_URL;

export const middleware = createMiddleware({
  loginRoute: "/login",
  selectOrgRoute: "/select-org",
  publicRoutes: ["/login", "/select-org"],
  // When QUIKIT_URL is set, redirect unauthenticated users to QuikIT's
  // central login instead of the local /login page.
  ...(QUIKIT_URL
    ? {
        centralLoginUrl: `${QUIKIT_URL}/login`,
        centralSelectOrgUrl: `${QUIKIT_URL}/select-org`,
      }
    : {}),
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
