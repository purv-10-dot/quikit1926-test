import { createMiddleware } from "@quikit/auth/middleware";

const QUIKSCALE_URL = process.env.QUIKSCALE_URL || "http://localhost:3004";

export const middleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/invitations"],
  centralLoginUrl: `${QUIKSCALE_URL}/login`,
  centralSelectOrgUrl: `${QUIKSCALE_URL}/select-org`,
});

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico).*)",
  ],
};
