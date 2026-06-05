import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { encode } from "next-auth/jwt";

/**
 * GET /auth-handoff?token=<jwt>
 *
 * Consumer-side endpoint of the launcher's tile-click hand-off. The launcher
 * mints a short-lived HS256 token signed with `INTERNAL_SECRET`. We verify it
 * here and, on success, mint a NextAuth-compatible JWT signed with
 * `NEXTAUTH_SECRET`, set it as this app's session cookie, then redirect to
 * the path the user originally wanted (carried in the `to` claim).
 *
 * Cookies cannot be shared across distinct *.vercel.app subdomains (public
 * suffix list), so this is how we bridge the launcher's session into each
 * consumer app's own domain.
 *
 * Failure modes:
 *   - missing/invalid/expired token → redirect to central auth /login
 *   - server misconfigured (no secrets) → 500
 *   - clock skew → tolerated up to 10s by jose
 */
function centralLoginUrl(reason: string): string {
  const base = process.env.NEXT_PUBLIC_AUTH_URL ?? process.env.QUIKIT_URL ?? "";
  return `${base}/login?reason=${reason}`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const origin = process.env.NEXTAUTH_URL ?? request.url;
  if (!token) {
    return NextResponse.redirect(centralLoginUrl("missing_handoff"));
  }

  const internalSecret = process.env.INTERNAL_SECRET;
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!internalSecret || !nextAuthSecret) {
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 },
    );
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
    const result = await jwtVerify(
      token,
      new TextEncoder().encode(internalSecret),
      { clockTolerance: "10s" },
    );
    payload = result.payload as typeof payload;
  } catch (err) {
    const reason = err instanceof Error && /exp/i.test(err.message) ? "expired" : "invalid";
    return NextResponse.redirect(centralLoginUrl(`${reason}_handoff`));
  }

  if (!payload.sub) {
    return NextResponse.redirect(centralLoginUrl("invalid_handoff"));
  }

  // Mint a NextAuth-compatible session JWE for this app's domain.
  // NextAuth uses JWE (encrypted JWT) by default — `getToken()` calls
  // `next-auth/jwt`'s `decode()` which expects this format. Producing a
  // plain JWT (e.g. via jose.SignJWT) would set the cookie but `getToken()`
  // would fail to decode it and treat the session as missing.
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
      // Shared Redis session id — lets the central /api/verify-token (called
      // by this app's middleware) soft-invalidate the handoff session.
      sessionId: payload.sessionId ?? undefined,
    },
    secret: nextAuthSecret,
    maxAge: 7 * 24 * 60 * 60,
  });

  // Seed this org's QuikInfra RBAC at the entry gate. The launcher routes
  // every QuikInfra tile-click through here, so seeding now guarantees the
  // org's 4 roles exist (and an admin-tier user is placed on the "admin"
  // role) BEFORE the dashboard renders — independent of whether any dashboard
  // page or /api/me/permissions later succeeds. This is what makes the
  // QuikScale flow ("open app → roles appear in Admin Portal") reliable for
  // QuikInfra too. Idempotent + 5-min cached, so it's a cheap no-op once
  // seeded. Best-effort: it must NEVER block or fail the session hand-off.
  if (payload.orgId) {
    try {
      const { seedDefaultRoles, ensureUserOnRole } = await import(
        "@/lib/rbac/seedDefaultRoles"
      );
      const seeded = await seedDefaultRoles(payload.orgId);
      const memberRole = (payload.membershipRole ?? "").toLowerCase();
      const adminTier =
        payload.isSuperAdmin === true ||
        ["super_admin", "platform_super_admin", "org_admin", "admin"].includes(
          memberRole,
        );
      if (seeded && adminTier) {
        await ensureUserOnRole(
          payload.sub,
          payload.orgId,
          seeded.adminRoleId,
          "auth-handoff",
        );
      }
    } catch {
      // best-effort — seeding must never block the session hand-off
    }
  }

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
    maxAge: 7 * 24 * 60 * 60, // 7 days
    // No `domain` — host-only cookie so it stays on this app's subdomain.
  });

  return response;
}

/** Reject absolute URLs / protocol-relative URLs / cross-host redirects. */
function sanitizeRedirect(to: string): string {
  if (!to || typeof to !== "string") return "/";
  if (!to.startsWith("/")) return "/";
  if (to.startsWith("//")) return "/";
  return to;
}
