import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { verifyTokenRemote } from "./verify-token-remote";

export interface MiddlewareConfig {
  loginRoute: string;
  selectOrgRoute?: string;
  publicRoutes: string[];
  superAdminRoutes?: string[];
  requireSuperAdmin?: boolean;
  /** Block non-admin members (org admins + super admins only). Uses JWT orgId + membershipRole. */
  requireAdmin?: boolean;
  /** Absolute URL to central login (e.g., "http://localhost:3004/login").
   *  When set, unauthenticated users are redirected here instead of a local login page. */
  centralLoginUrl?: string;
  /** Absolute URL to the central launcher /apps (org picker lives there),
   *  e.g. "https://quik-it-auth.vercel.app/apps". No-org / revoked-membership
   *  users are redirected here instead of a per-app select-org page. */
  centralSelectOrgUrl?: string;
  /** Route to redirect authenticated users hitting /login when no callbackUrl is set.
   *  Defaults to selectOrgRoute, then "/dashboard". */
  postLoginRoute?: string;
  /** Validate JWT remotely against the central auth service (Redis-backed).
   *  Defaults to true when `centralLoginUrl` is set and INTERNAL_SECRET exists. */
  enforceRemoteSessionValidation?: boolean;
}

// Single source of truth for which membership roles can pass `requireAdmin`
// gates. Imported from @quikit/shared so the launcher visibility filter, the
// per-app middleware, and the in-app permission helpers all agree on the set
// (super_admin / org_admin / legacy "admin"). The stale local copy that lived
// here previously omitted "org_admin", which silently bounced freshly-invited
// Org Admins out of the admin app on every click.
const ADMIN_ROLES = ADMIN_TIER_ROLES;

export function createMiddleware(config: MiddlewareConfig) {
  const shouldRemoteValidate =
    config.enforceRemoteSessionValidation ??
    Boolean(config.centralLoginUrl && process.env.INTERNAL_SECRET);

  let authBaseUrl: string | undefined;
  if (config.centralLoginUrl) {
    try {
      authBaseUrl = new URL(config.centralLoginUrl).origin;
    } catch {
      authBaseUrl = undefined;
    }
  }

  return async function middleware(request: NextRequest) {
    // Redirect loop detection: if we've redirected 3+ times, break the loop
    const redirectCount = parseInt(request.cookies.get("_redirect_count")?.value || "0", 10);
    if (redirectCount >= 3) {
      const response = NextResponse.next();
      response.cookies.delete("_redirect_count");
      return response;
    }

    /** Helper: redirect with loop counter */
    function safeRedirect(url: string | URL): NextResponse {
      const response = NextResponse.redirect(url);
      response.cookies.set("_redirect_count", String(redirectCount + 1), { maxAge: 30 });
      return response;
    }

    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const { pathname } = request.nextUrl;

    const isPublicRoute = config.publicRoutes.some((r) => pathname.startsWith(r));
    const isLoginRoute = pathname.startsWith(config.loginRoute);
    const isSelectOrgRoute = config.selectOrgRoute
      ? pathname.startsWith(config.selectOrgRoute)
      : false;
    const isSuperAdminRoute = config.superAdminRoutes?.some((r) => pathname.startsWith(r)) ?? false;

    // If we're running behind a central auth service, validate the cookie/token
    // against auth's /api/verify-token on protected routes. That endpoint now
    // uses verifyJWT() + Redis session lookup, so TTL expiry / revoke instantly
    // invalidates access across sibling apps.
    if (
      token &&
      shouldRemoteValidate &&
      !isPublicRoute &&
      !isLoginRoute &&
      authBaseUrl
    ) {
      const remote = await verifyTokenRemote({
        authUrl: authBaseUrl,
        internalSecret: process.env.INTERNAL_SECRET,
        cookie: request.headers.get("cookie") ?? undefined,
      });
      if (!remote.valid && !remote.error) {
        const loginTarget = config.centralLoginUrl
          ? `${config.centralLoginUrl}?reason=session_expired`
          : new URL(`${config.loginRoute}?reason=session_expired`, request.url).toString();
        return safeRedirect(loginTarget);
      }
    }

    // Unauthenticated users → central login or local login
    if (!token && !isPublicRoute) {
      if (config.centralLoginUrl) {
        return safeRedirect(config.centralLoginUrl);
      }
      return safeRedirect(new URL(config.loginRoute, request.url));
    }

    // Authenticated user on local login page → honor callbackUrl, else go to dashboard
    if (token && isLoginRoute) {
      const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
      if (callbackUrl) {
        // Only allow same-origin or absolute URLs that point back to this host
        try {
          const target = new URL(callbackUrl, request.url);
          if (target.origin === request.nextUrl.origin) {
            return safeRedirect(target);
          }
        } catch {
          // fall through to default redirect
        }
      }
      const redirectTo = config.postLoginRoute || config.selectOrgRoute || "/dashboard";
      return safeRedirect(new URL(redirectTo, request.url));
    }

    // Super-admin-only app: block non-super-admins
    if (config.requireSuperAdmin && token && !token.isSuperAdmin && !isLoginRoute) {
      const loginTarget = config.centralLoginUrl
        ? `${config.centralLoginUrl}?reason=unauthorized`
        : new URL(`${config.loginRoute}?reason=unauthorized`, request.url).toString();
      return safeRedirect(loginTarget);
    }

    // Org-level admin portal: members without admin role bounce to login with reason.
    if (
      config.requireAdmin &&
      token &&
      token.orgId &&
      !token.isSuperAdmin &&
      !ADMIN_ROLES.has(String(token.membershipRole ?? "")) &&
      !isLoginRoute
    ) {
      const loginTarget = config.centralLoginUrl
        ? `${config.centralLoginUrl}?reason=unauthorized`
        : new URL(`${config.loginRoute}?reason=unauthorized`, request.url).toString();
      return safeRedirect(loginTarget);
    }

    // If the JWT callback detected that membership was revoked, force re-selection
    if (token && token.membershipInvalid && !isSelectOrgRoute && !isPublicRoute && !isLoginRoute) {
      if (config.centralSelectOrgUrl) {
        return safeRedirect(config.centralSelectOrgUrl);
      }
      if (config.selectOrgRoute) {
        return safeRedirect(new URL(config.selectOrgRoute, request.url));
      }
    }

    // Org selection enforcement
    if (token && !token.orgId && !isSelectOrgRoute && !isPublicRoute) {
      if (isSuperAdminRoute && token.isSuperAdmin) {
        return NextResponse.next();
      }
      // Redirect to the central launcher /apps (cross-domain) or, on the
      // launcher itself, its local /apps org picker.
      if (config.centralSelectOrgUrl) {
        return safeRedirect(config.centralSelectOrgUrl);
      }
      if (config.selectOrgRoute) {
        return safeRedirect(new URL(config.selectOrgRoute, request.url));
      }
    }

    // Successful navigation — reset redirect counter
    const response = NextResponse.next();
    if (redirectCount > 0) {
      response.cookies.delete("_redirect_count");
    }
    return response;
  };
}
