import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { encode } from "next-auth/jwt";
import { publicBaseUrl } from "@quikit/auth/public-url";

/**
 * GET /auth-handoff?token=<jwt>
 *
 * Consumer-side endpoint of the launcher's tile-click hand-off. The launcher
 * mints a short-lived HS256 token signed with `INTERNAL_SECRET`. We verify it
 * here and, on success, mint a NextAuth-compatible JWT signed with
 * `NEXTAUTH_SECRET`, set it as this app's session cookie, then redirect to
 * the path the user originally wanted (carried in the `to` claim).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  // This app's own public origin — never `request.url` (resolves to the pod
  // bind address 0.0.0.0:PORT when the ingress doesn't preserve the Host
  // header). The session cookie below is host-only, so we must redirect back
  // to the same host that served this request. See @quikit/auth/public-url.
  const origin = publicBaseUrl(request);
  if (!token) {
    return NextResponse.redirect(new URL("/login?reason=missing_handoff", origin));
  }

  const internalSecret = process.env.INTERNAL_SECRET;
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!internalSecret || !nextAuthSecret) {
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 },
    );
  }

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
  };
  try {
    const result = await jwtVerify(
      token,
      new TextEncoder().encode(internalSecret),
      { clockTolerance: "10s" },
    );
    payload = result.payload as typeof payload;
  } catch (err) {
    const reason = err instanceof Error && /exp/i.test(err.message) ? "expired" : "invalid";
    return NextResponse.redirect(new URL(`/login?reason=${reason}_handoff`, origin));
  }

  if (!payload.sub) {
    return NextResponse.redirect(new URL("/login?reason=invalid_handoff", origin));
  }

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
    },
    secret: nextAuthSecret,
    maxAge: 7 * 24 * 60 * 60,
  });

  const safeTo = sanitizeRedirect(payload.to ?? "/");
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

function sanitizeRedirect(to: string): string {
  if (!to || typeof to !== "string") return "/";
  if (!to.startsWith("/")) return "/";
  if (to.startsWith("//")) return "/";
  return to;
}
