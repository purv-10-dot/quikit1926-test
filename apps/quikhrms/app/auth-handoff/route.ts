import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { encode } from "next-auth/jwt";

/**
 * GET /auth-handoff?token=<jwt>
 *
 * Consumer-side endpoint of the QuikIT launcher's tile-click hand-off. The
 * launcher mints a short-lived HS256 token signed with `INTERNAL_SECRET`. We
 * verify it here and, on success, mint a NextAuth-compatible session JWE signed
 * with `NEXTAUTH_SECRET`, set it as HRMS's session cookie, then redirect to the
 * path the user wanted (the `to` claim, default /hrms).
 *
 * Mirrors apps/quikscale/app/auth-handoff/route.ts. This is what makes a tile
 * click land the user inside HRMS without a second login.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const origin = process.env.NEXTAUTH_URL ?? request.url;
  if (!token) {
    return NextResponse.redirect(new URL("/login?reason=missing_handoff", origin));
  }

  const internalSecret = process.env.INTERNAL_SECRET;
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!internalSecret || !nextAuthSecret) {
    return NextResponse.json({ success: false, error: "Server misconfigured" }, { status: 500 });
  }

  // Verify the launcher-signed token.
  let payload: {
    sub?: string;
    orgId?: string | null;
    appId?: string;
    slug?: string;
    to?: string;
    isSuperAdmin?: boolean;
    membershipRole?: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    sessionId?: string | null;
  };
  try {
    const result = await jwtVerify(token, new TextEncoder().encode(internalSecret), {
      clockTolerance: "10s",
    });
    payload = result.payload as typeof payload;
  } catch (err) {
    const reason = err instanceof Error && /exp/i.test(err.message) ? "expired" : "invalid";
    return NextResponse.redirect(new URL(`/login?reason=${reason}_handoff`, origin));
  }

  if (!payload.sub) {
    return NextResponse.redirect(new URL("/login?reason=invalid_handoff", origin));
  }

  // Mint a NextAuth-compatible session JWE for HRMS's domain. NextAuth uses an
  // encrypted JWT by default — `getToken()` (used by withAuth + middleware)
  // expects this format, so we must use next-auth/jwt's encode().
  const sessionToken = await encode({
    token: {
      sub: payload.sub,
      id: payload.sub,
      orgId: payload.orgId ?? undefined,
      isSuperAdmin: payload.isSuperAdmin ?? false,
      membershipRole: payload.membershipRole ?? undefined,
      email: payload.email ?? undefined,
      firstName: payload.firstName ?? undefined,
      lastName: payload.lastName ?? undefined,
      name: payload.name ?? undefined,
      sessionId: payload.sessionId ?? undefined,
    },
    secret: nextAuthSecret,
    maxAge: 7 * 24 * 60 * 60,
  });

  const safeTo = sanitizeRedirect(payload.to ?? "/dashboard");
  const response = NextResponse.redirect(new URL(safeTo, origin));

  const cookieName =
    process.env.NODE_ENV === "production"
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token";

  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}

/** Reject absolute / protocol-relative / cross-host redirects; default to /hrms. */
function sanitizeRedirect(to: string): string {
  if (!to || typeof to !== "string") return "/dashboard";
  if (!to.startsWith("/")) return "/dashboard";
  if (to.startsWith("//")) return "/dashboard";
  return to;
}
