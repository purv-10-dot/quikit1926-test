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
 *   Org selection happens on the launcher /apps, not a page here.
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
    // Liveness probe — must be reachable without a session so Cloud Run /
    // GKE health checks succeed before any user logs in.
    "/api/health",
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
        const callbackUrl = new URL(callback, req.url);
        // Cross-origin callback → route through /api/post-login so the
        // target sub-app gets a host-scoped session cookie via the
        // /auth-handoff bridge. Same-origin callbacks (the auth app
        // itself, or a relative /path) can short-circuit.
        if (callbackUrl.origin !== req.nextUrl.origin) {
          const bridge = new URL("/api/post-login", req.url);
          bridge.searchParams.set("callbackUrl", callbackUrl.toString());
          return NextResponse.redirect(bridge);
        }
        return NextResponse.redirect(callbackUrl);
      } catch {
        // fall through
      }
    }
    if (token.isSuperAdmin) {
      const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL;
      if (adminUrl) {
        // Even for super admins, hopping cross-origin needs the bridge.
        const bridge = new URL("/api/post-login", req.url);
        bridge.searchParams.set("callbackUrl", adminUrl);
        return NextResponse.redirect(bridge);
      }
    }
    const launcherUrl =
      process.env.NEXT_PUBLIC_LAUNCHER_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL;
    if (launcherUrl) {
      const apps = `${launcherUrl.replace(/\/+$/, "").replace(/\/apps$/, "")}/apps`;
      const bridge = new URL("/api/post-login", req.url);
      bridge.searchParams.set("callbackUrl", apps);
      return NextResponse.redirect(bridge);
    }
    // No launcher URL configured (shouldn't happen in any real deploy) —
    // let the authenticated user stay rather than bounce to a removed page.
    return NextResponse.next();
  }

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
