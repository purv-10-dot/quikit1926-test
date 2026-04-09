import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = request.nextUrl;

  const isLoginRoute = pathname.startsWith("/login");
  const isSelectOrgRoute = pathname.startsWith("/select-org");
  const isInvitationRoute = pathname.startsWith("/invitations");
  const isOrganisationsRoute = pathname.startsWith("/dashboard/organisations");

  // Public routes: login, invitation accept
  if (!token && !isLoginRoute && !isInvitationRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token && isLoginRoute) {
    return NextResponse.redirect(new URL("/select-org", request.url));
  }

  // If logged in but no org selected, force org selection
  // Exception: super admins can access /dashboard/organisations without selecting an org
  if (token && !token.tenantId && !isSelectOrgRoute && !isLoginRoute && !isInvitationRoute) {
    if (isOrganisationsRoute && token.isSuperAdmin) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/select-org", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico).*)",
  ],
};
