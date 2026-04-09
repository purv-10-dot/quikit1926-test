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
}

export function createMiddleware(config: MiddlewareConfig) {
  return async function middleware(request: NextRequest) {
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
        return NextResponse.redirect(config.centralLoginUrl);
      }
      return NextResponse.redirect(new URL(config.loginRoute, request.url));
    }

    // Authenticated user on local login page → redirect to dashboard
    if (token && isLoginRoute) {
      const redirectTo = config.selectOrgRoute || "/dashboard";
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }

    // Super-admin-only app: block non-super-admins
    if (config.requireSuperAdmin && token && !token.isSuperAdmin && !isLoginRoute) {
      const loginTarget = config.centralLoginUrl
        ? `${config.centralLoginUrl}?reason=unauthorized`
        : new URL(`${config.loginRoute}?reason=unauthorized`, request.url).toString();
      return NextResponse.redirect(loginTarget);
    }

    // Org selection enforcement
    if (token && !token.tenantId && !isSelectOrgRoute && !isPublicRoute) {
      if (isSuperAdminRoute && token.isSuperAdmin) {
        return NextResponse.next();
      }
      // Redirect to central select-org or local select-org
      if (config.centralSelectOrgUrl) {
        return NextResponse.redirect(config.centralSelectOrgUrl);
      }
      if (config.selectOrgRoute) {
        return NextResponse.redirect(new URL(config.selectOrgRoute, request.url));
      }
    }

    return NextResponse.next();
  };
}
