import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export interface MiddlewareConfig {
  loginRoute: string;
  selectOrgRoute: string;
  publicRoutes: string[];
  superAdminRoutes?: string[];
}

export function createMiddleware(config: MiddlewareConfig) {
  return async function middleware(request: NextRequest) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const { pathname } = request.nextUrl;

    const isPublicRoute = config.publicRoutes.some((r) => pathname.startsWith(r));
    const isLoginRoute = pathname.startsWith(config.loginRoute);
    const isSelectOrgRoute = pathname.startsWith(config.selectOrgRoute);
    const isSuperAdminRoute = config.superAdminRoutes?.some((r) => pathname.startsWith(r)) ?? false;

    if (!token && !isPublicRoute) {
      return NextResponse.redirect(new URL(config.loginRoute, request.url));
    }

    if (token && isLoginRoute) {
      return NextResponse.redirect(new URL(config.selectOrgRoute, request.url));
    }

    if (token && !token.tenantId && !isSelectOrgRoute && !isPublicRoute) {
      if (isSuperAdminRoute && token.isSuperAdmin) {
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL(config.selectOrgRoute, request.url));
    }

    return NextResponse.next();
  };
}
