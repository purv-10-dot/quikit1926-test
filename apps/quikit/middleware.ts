import { createMiddleware } from "@quikit/auth/middleware";

export const middleware = createMiddleware({
  loginRoute: "/login",
  selectOrgRoute: "/select-org",
  publicRoutes: [
    "/login",
    "/select-org",
    "/api/oauth/authorize",
    "/api/oauth/token",
    "/api/oauth/userinfo",
    "/api/oauth/jwks",
  ],
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
