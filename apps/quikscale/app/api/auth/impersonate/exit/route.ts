/**
 * SA-D.5 — Exit impersonation.
 *
 * POST /api/auth/impersonate/exit
 *
 * Records a SessionEvent, stamps Impersonation.exitedAt if we can match it,
 * clears the session cookie, and redirects back to the QuikIT launcher so
 * the super admin is in their own session again.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";

// Exit rate limit — permissive. We NEVER want to trap a user who is trying to
// get out of an impersonation session. Fail-OPEN on Redis outage for that
// reason. 30/min/IP is enough to stop abuse but never legitimate exits.
const EXIT_LIMIT = 30;
const EXIT_WINDOW_MS = 60 * 1000;

function sessionCookieName(): string {
  const isSecure = process.env.NODE_ENV === "production";
  return isSecure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

export async function POST(req: NextRequest) {
  try {
    const rl = await rateLimitAsync({
      routeKey: "auth:impersonate:exit",
      clientKey: getClientIp(req),
      limit: EXIT_LIMIT,
      windowMs: EXIT_WINDOW_MS,
      failClosed: false, // NEVER fail-closed — users must always be able to exit.
    });
    if (!rl.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many exit attempts. Retry in ${rl.retryAfterSeconds}s.`,
        },
        {
          status: 429,
          headers: { "retry-after": String(rl.retryAfterSeconds) },
        },
      );
    }

    const session = await getServerSession(authOptions);
    const isImp = session?.user?.impersonating === true;
    const tenantId = session?.user?.tenantId ?? null;
    const userId = session?.user?.id ?? null;
    const impersonatorUserId = session?.user?.impersonatorUserId ?? null;

    if (isImp && userId) {
      // Mark the most recent active Impersonation row as exited (best-effort)
      const imp = await db.impersonation.findFirst({
        where: {
          targetUserId: userId,
          superAdminId: impersonatorUserId ?? undefined,
          acceptedAt: { not: null },
          exitedAt: null,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (imp) {
        await db.impersonation.update({ where: { id: imp.id }, data: { exitedAt: new Date() } });
      }

      // Record session event for analytics.
      try {
        await db.sessionEvent.create({
          data: {
            tenantId,
            userId,
            event: "impersonation_end",
            appSlug: "quikscale",
            ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
            userAgent: req.headers.get("user-agent"),
          },
        });
      } catch {
        // swallow — analytics failure must not block exit
      }
    }

    const launcher = process.env.QUIKIT_URL ?? "/";
    const response = NextResponse.json({
      success: true,
      data: { redirectUrl: launcher.replace(/\/+$/, "") + "/apps" },
    });
    // Clear both possible cookie names (prod + dev) just in case.
    response.cookies.set({ name: sessionCookieName(), value: "", maxAge: 0, path: "/" });
    response.cookies.set({ name: "next-auth.session-token", value: "", maxAge: 0, path: "/" });
    response.cookies.set({ name: "__Secure-next-auth.session-token", value: "", maxAge: 0, path: "/" });
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to exit impersonation";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
