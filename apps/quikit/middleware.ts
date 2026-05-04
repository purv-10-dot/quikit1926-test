import { createMiddleware } from "@quikit/auth/middleware";

/**
 * Launcher (3000) + OAuth IdP. When NEXT_PUBLIC_AUTH_URL points at `apps/auth` (3004),
 * `/login` is NOT public — unauthenticated traffic is sent to central credentials login only.
 * Org picker stays on this host (`/select-org`), not on the auth service.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL?.replace(/\/$/, "");

const launcherPublicRoutes = [
  "/select-org",
  "/api/oauth/authorize",
  "/api/oauth/token",
  "/api/oauth/userinfo",
  "/api/oauth/jwks",
  "/.well-known/openid-configuration",
];

export const middleware = createMiddleware({
  loginRoute: "/login",
  selectOrgRoute: "/select-org",
  postLoginRoute: "/apps",
  publicRoutes: AUTH_URL ? launcherPublicRoutes : ["/login", ...launcherPublicRoutes],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
});

export const config = {
  // Exclusions:
  //   api/             — API routes have their own auth wrappers
  //   _next/static     — Next.js compiled assets
  //   _next/image      — Next.js image-optimization endpoint
  //   app-icons/       — public/app-icons (logos shown on the launcher pre-auth)
  //   favicon.ico      — browser-requested
  // Add new public-asset paths here when they're served from /public.
  matcher: ["/((?!api/|_next/static|_next/image|app-icons/|favicon.ico).*)"],
};
