import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddleware } from "@quikit/auth/middleware";

/**
 * Launcher (3000) + OAuth IdP. When NEXT_PUBLIC_AUTH_URL points at `apps/auth` (3004),
 * `/login` is NOT public — unauthenticated traffic is sent to central credentials login only.
 * Org selection happens inline on the launcher `/apps` page (no separate
 * select-org route any more).
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL?.replace(/\/$/, "");

// If NEXT_PUBLIC_AUTH_URL points at THIS host, the launcher serves /login
// itself. Detected at request time via header; below we just check origin.
// The build can't know the request origin, so we always treat /login as
// public on the launcher — the page exists either way (legacy /login is
// kept for self-hosted deploys).
const launcherPublicRoutes = [
  "/login",
  "/api/oauth/authorize",
  "/api/oauth/token",
  "/api/oauth/userinfo",
  "/api/oauth/jwks",
  "/.well-known/openid-configuration",
];

// Only set centralLoginUrl when AUTH_URL points at a DIFFERENT host.
// (When AUTH_URL === launcher's own URL, redirecting /login → /login loops.)
function isSelfHosted(authUrl: string | undefined): boolean {
  if (!authUrl) return true;
  const launcherUrl = process.env.NEXT_PUBLIC_QUIKIT_URL?.replace(/\/$/, "");
  return launcherUrl === authUrl;
}

const factory = createMiddleware({
  loginRoute: "/login",
  // The launcher's /apps page IS the org picker. Treat it as the
  // select-org route so the factory lets no-org users land there
  // (and doesn't loop them back out).
  selectOrgRoute: "/apps",
  postLoginRoute: "/apps",
  publicRoutes: launcherPublicRoutes,
  centralLoginUrl: isSelfHosted(AUTH_URL) ? undefined : `${AUTH_URL}/login`,
  // Super-admin routes — bypass the org-selection gate so super admins
  // without any OrgMember rows can still reach the launcher + super-admin
  // panels to bootstrap orgs.
  superAdminRoutes: [
    "/apps",
    "/app-registry",
    "/organizations",
    "/broadcasts",
    "/platform-users",
    "/audit",
    "/plans",
    "/analytics",
    "/feature-flags",
  ],
});

/**
 * Marketing paths are owned by the marketing zone (proxied via
 * next.config rewrites). They must NOT hit the auth factory (which would
 * bounce unauthenticated visitors to /login). Exact set + the two
 * prefixed trees. "/" is matched exactly — never via startsWith.
 */
const MARKETING_EXACT = new Set([
  "/",
  "/blog",
  "/sitemap.xml",
  "/robots.txt",
  "/platform",
  "/products",
  "/pricing",
  "/contact",
  "/quikcrm",
  "/quikinfra",
  "/quikscale",
  "/quiksocial",
  "/quiktrack",
]);

function isMarketingPath(pathname: string): boolean {
  if (MARKETING_EXACT.has(pathname)) return true;
  return pathname.startsWith("/blog/") || pathname.startsWith("/assets/");
}

function safeNext(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/apps";
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  // Marketing zone — let the rewrite proxy it; never auth-gate it.
  if (isMarketingPath(pathname)) return NextResponse.next();

  // The standalone /login page is retired — the login modal on the
  // marketing landing replaces it. Anything pointed at /login (old links,
  // factory fallbacks) goes to the marketing page with the modal opened,
  // preserving the intended post-login destination.
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    const url = new URL("/", request.url);
    url.searchParams.set(
      "next",
      safeNext(request.nextUrl.searchParams.get("callbackUrl")),
    );
    return NextResponse.redirect(url);
  }

  const res = await factory(request);

  // The factory bounces unauthenticated users to the login route. Rewrite
  // that to the marketing landing + modal, carrying the original path
  // (incl. ?handoff=&to= for cross-app SSO) as ?next= so login resumes
  // exactly where the user was headed.
  if (res && (res.status === 307 || res.status === 308)) {
    const loc = res.headers.get("location") ?? "";
    try {
      const locUrl = new URL(loc, request.url);
      const sameHost = locUrl.host === request.nextUrl.host;
      if (sameHost && locUrl.pathname.startsWith("/login")) {
        const url = new URL("/", request.url);
        url.searchParams.set("next", `${pathname}${search}`);
        return NextResponse.redirect(url);
      }
    } catch {
      /* non-URL location — leave the factory response as-is */
    }
  }

  return res;
}

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
