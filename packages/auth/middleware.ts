import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export interface MiddlewareConfig {
  loginRoute: string;
  selectOrgRoute?: string;
  publicRoutes: string[];
  superAdminRoutes?: string[];
  requireSuperAdmin?: boolean;
  /** Absolute URL to central login (e.g., "http://localhost:3004/login").
   *  When set, unauthenticated users are redirected here instead of a local login page. */
  centralLoginUrl?: string;
  /** Absolute URL to central select-org page (e.g., "http://localhost:3004/select-org"). */
  centralSelectOrgUrl?: string;
  /** Route to redirect authenticated users hitting /login when no callbackUrl is set.
   *  Defaults to selectOrgRoute, then "/dashboard". */
  postLoginRoute?: string;
}

export function createMiddleware(config: MiddlewareConfig) {
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
    if (token && !token.tenantId && !isSelectOrgRoute && !isPublicRoute) {
      if (isSuperAdminRoute && token.isSuperAdmin) {
        return NextResponse.next();
      }
      // Redirect to central select-org or local select-org
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
