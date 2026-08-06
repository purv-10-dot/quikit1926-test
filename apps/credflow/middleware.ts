import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  AUTH_LOGIN_PATH,
  AUTH_POST_LOGIN_PATH,
  hasCompleteAuthJwt,
} from "@/lib/auth/routes";

const PUBLIC_PREFIXES = [AUTH_LOGIN_PATH, "/select-org", "/invitations"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Page middleware (API routes excluded via matcher).
 * Only treats the user as signed-in when the JWT includes `sub` + `orgId`
 * (same bar as `requireUser()` / `readSession()`), avoiding redirect loops
 * from stale or partial session cookies.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const authed = hasCompleteAuthJwt(token);

  if (pathname.startsWith(AUTH_LOGIN_PATH)) {
    if (authed) {
      return NextResponse.redirect(new URL(AUTH_POST_LOGIN_PATH, request.url));
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!authed) {
    return NextResponse.redirect(new URL(AUTH_LOGIN_PATH, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon.ico).*)"],
};
