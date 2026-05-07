import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * auth.quikit.ai middleware.
 *
 * This is the *central* login host, so it never delegates to itself.
 * - Unauthenticated users can freely hit all (auth) pages.
 * - Authenticated users hitting /login get bounced to the launcher
 *   (NEXT_PUBLIC_LAUNCHER_URL) or admin panel if they are super admin.
 * - /select-org stays accessible as long as the session is valid.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const PUBLIC = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    // Native-invite acceptance — landing page + API are reachable without
    // a session because the user authenticates by presenting their
    // single-use invitation token (FRD FR-SA-009 / FR-SA-010).
    "/invitations/accept",
    "/api/invitations",
    "/api/auth",
    "/api/verify-token",
  ];
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  async function isRedisSessionStillValid(): Promise<boolean> {
    const internalSecret = process.env.INTERNAL_SECRET;
    if (!internalSecret) return true; // fail-open when auth internal secret is not configured
    try {
      const res = await fetch(new URL("/api/verify-token", req.url), {
        method: "GET",
        headers: {
          "x-internal-secret": internalSecret,
          cookie: req.headers.get("cookie") ?? "",
          accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) return true; // fail-open on temporary backend issues
      const body = (await res.json()) as { valid?: boolean };
      return Boolean(body.valid);
    } catch {
      return true;
    }
  }

  if (pathname === "/" || pathname === "") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (token && pathname.startsWith("/login")) {
    const validSession = await isRedisSessionStillValid();
    if (!validSession) {
      return NextResponse.next();
    }
    const callback = req.nextUrl.searchParams.get("callbackUrl");
    if (callback) {
      try {
        return NextResponse.redirect(new URL(callback, req.url));
      } catch {
        // fall through
      }
    }
    if (token.isSuperAdmin) {
      const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL;
      if (adminUrl) return NextResponse.redirect(adminUrl);
    }
    const launcherUrl = process.env.NEXT_PUBLIC_LAUNCHER_URL;
    if (launcherUrl) return NextResponse.redirect(launcherUrl);
    return NextResponse.redirect(new URL("/select-org", req.url));
  }

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
