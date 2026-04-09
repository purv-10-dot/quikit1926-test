import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname.startsWith("/login");

  if (!token && !isLoginRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (token && isLoginRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  // Block non-super-admins
  if (token && !token.isSuperAdmin && !isLoginRoute) {
    return NextResponse.redirect(new URL("/login?reason=unauthorized", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
