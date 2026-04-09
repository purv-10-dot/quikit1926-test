import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = request.nextUrl;

  // Public routes that don't need auth
  const isLoginRoute = pathname.startsWith("/login");
  const isSelectOrgRoute = pathname.startsWith("/select-org");

  // Dev: ?preview=1 bypasses auth check
  const isPreview = request.nextUrl.searchParams.get("preview");

  // If no token and trying to access protected route, redirect to login
  if (!token && !isLoginRoute && !isPreview) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If token exists and trying to access login, redirect to select-org
  if (token && isLoginRoute) {
    return NextResponse.redirect(new URL("/select-org", request.url));
  }

  // If token exists but no tenantId selected, force to select-org
  // (except if already on select-org or API routes)
  if (token && !token.tenantId && !isSelectOrgRoute && !isLoginRoute && !isPreview) {
    return NextResponse.redirect(new URL("/select-org", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/ (API routes handle auth themselves and return 401, not redirect)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/|_next/static|_next/image|favicon.ico).*)",
  ],
};
