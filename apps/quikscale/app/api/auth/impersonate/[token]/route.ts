/**
 * SA-D.3 — Impersonation accept endpoint (QuikScale side).
 *
 * GET /api/auth/impersonate/:token
 *
 * Called by the super admin's browser (redirect from the launcher's start
 * endpoint). Validates the one-time token, creates a NextAuth session as the
 * target user with impersonation flags set, and redirects to the landing
 * path on success.
 *
 * Security model:
 *   - Token is single-use; accepting it sets Impersonation.acceptedAt.
 *     Replay attempts return 410 Gone.
 *   - Token expires after 2h (hard deadline in the DB row).
 *   - Session cookie inherits the Impersonation's expiresAt, so even if the
 *     super admin doesn't explicitly exit, the session dies at the deadline.
 *   - A SessionEvent ("impersonation_start") is recorded so analytics
 *     distinguish real user activity from customer-support activity.
 *
 * Config requirement: NEXTAUTH_SECRET must be the SAME across quikit and
 * quikscale (they already share it for the OAuth flow).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/api/auditLog";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";

const TTL_SECONDS = 2 * 60 * 60;

// Token-redemption rate limit (per IP). Legit redemptions are 1-per-click;
// sustained hits almost always mean token-scanning. Fail-closed so an attacker
// who knocks Redis over can't flood the endpoint unthrottled.
const ACCEPT_LIMIT = 20;
const ACCEPT_WINDOW_MS = 15 * 60 * 1000;

// NextAuth cookie name depends on HTTPS. In dev (http) it's the plain form.
function sessionCookieName(): string {
  const isSecure = process.env.NODE_ENV === "production";
  return isSecure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    // Rate limit BEFORE any DB lookup so we don't leak token existence via
    // timing, and so an attacker scanning tokens can't generate DB load.
    const rl = await rateLimitAsync({
      routeKey: "auth:impersonate:accept",
      clientKey: getClientIp(req),
      limit: ACCEPT_LIMIT,
      windowMs: ACCEPT_WINDOW_MS,
      failClosed: true,
    });
    if (!rl.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many impersonation token attempts. Retry in ${rl.retryAfterSeconds}s.`,
        },
        {
          status: 429,
          headers: { "retry-after": String(rl.retryAfterSeconds) },
        },
      );
    }

    const token = params.token;
    if (!token) {
      return NextResponse.json({ success: false, error: "Missing token" }, { status: 400 });
    }

    const imp = await db.impersonation.findUnique({
      where: { token },
    });
    if (!imp) {
      return NextResponse.json({ success: false, error: "Invalid or expired token" }, { status: 404 });
    }

    if (imp.targetAppSlug !== "quikscale") {
      return NextResponse.json({ success: false, error: "Token is not for this app" }, { status: 400 });
    }
    if (imp.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ success: false, error: "Token expired" }, { status: 410 });
    }
    if (imp.acceptedAt) {
      return NextResponse.json({ success: false, error: "Token already used" }, { status: 410 });
    }

    // Load target user + super admin for session claims + audit narrative
    const [targetUser, superAdmin] = await Promise.all([
      db.user.findUnique({
        where: { id: imp.targetUserId },
        select: { id: true, email: true, firstName: true, lastName: true, isSuperAdmin: true },
      }),
      db.user.findUnique({
        where: { id: imp.superAdminId },
        select: { id: true, email: true },
      }),
    ]);
    if (!targetUser || !superAdmin) {
      return NextResponse.json({ success: false, error: "Target user or super admin not found" }, { status: 404 });
    }
    if (targetUser.isSuperAdmin) {
      return NextResponse.json({ success: false, error: "Cannot impersonate another super admin" }, { status: 403 });
    }

    const membership = await db.membership.findFirst({
      where: { userId: imp.targetUserId, tenantId: imp.targetTenantId, status: "active" },
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "Target user no longer has active membership in target tenant" },
        { status: 404 },
      );
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ success: false, error: "Server missing NEXTAUTH_SECRET" }, { status: 500 });
    }

    // Build the JWT payload matching our augmented types (packages/auth/types.ts)
    const jwtPayload = {
      id: targetUser.id,
      email: targetUser.email,
      tenantId: imp.targetTenantId,
      membershipRole: membership.role,
      isSuperAdmin: false,
      impersonating: true,
      impersonatorUserId: imp.superAdminId,
      impersonatorEmail: superAdmin.email,
      impersonationExpiresAt: imp.expiresAt.toISOString(),
    };

    const jwt = await encode({
      token: jwtPayload,
      secret,
      maxAge: Math.max(60, Math.floor((imp.expiresAt.getTime() - Date.now()) / 1000)),
    });

    // Mark token consumed + record session start
    await Promise.all([
      db.impersonation.update({
        where: { id: imp.id },
        data: { acceptedAt: new Date() },
      }),
      db.sessionEvent.create({
        data: {
          tenantId: imp.targetTenantId,
          userId: imp.targetUserId,
          event: "impersonation_start",
          appSlug: "quikscale",
          ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: req.headers.get("user-agent"),
        },
      }),
    ]);

    // Audit on the tenant side for visibility by tenant admins (with
    // actorId = superAdminId so it's clear who did it).
    writeAuditLog({
      tenantId: imp.targetTenantId,
      actorId: imp.superAdminId,
      action: "UPDATE",
      entityType: "Impersonation",
      entityId: imp.id,
      changes: [`Session started as ${targetUser.email}`],
      reason: imp.reason ?? "Super admin impersonation",
    }).catch(() => {
      // Never let audit failure block the impersonation. Error is logged inside writeAuditLog.
    });

    // Landing path from query string, default /dashboard
    const landingParam = req.nextUrl.searchParams.get("landing") ?? "/dashboard";
    const landing = landingParam.startsWith("/") ? landingParam : "/dashboard";

    const response = NextResponse.redirect(new URL(landing, req.url));
    response.cookies.set({
      name: sessionCookieName(),
      value: jwt,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: TTL_SECONDS,
    });
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to accept impersonation";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
