import { createMiddleware } from "@quikit/auth/middleware";

const QUIKIT_URL = process.env.QUIKIT_URL || "http://localhost:3000";

export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/invitations"],
  centralLoginUrl: `${QUIKIT_URL}/login`,
  centralSelectOrgUrl: `${QUIKIT_URL}/select-org`,
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
