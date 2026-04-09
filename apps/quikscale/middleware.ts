import { createMiddleware } from "@quikit/auth/middleware";

export const middleware = createMiddleware({
  loginRoute: "/login",
  selectOrgRoute: "/select-org",
  publicRoutes: ["/login", "/select-org"],
});

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico).*)",
  ],
};
