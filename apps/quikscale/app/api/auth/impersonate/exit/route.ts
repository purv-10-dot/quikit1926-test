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

/**
 * Clear a NextAuth session cookie for real.
 *
 * Browsers treat cookies as "different" if Set-Cookie attributes don't match
 * on delete. The `__Secure-` prefix in particular REQUIRES secure: true on
 * the Set-Cookie directive — without it, the browser rejects the clear
 * entirely and the old cookie survives. That's why earlier prod builds had
 * impersonation sessions "coming back" after exit.
 *
 * Match the attributes used when the cookie was originally set by the
 * accept route (see app/api/auth/impersonate/[token]/route.ts).
 */
function clearSessionCookie(res: NextResponse, name: string) {
  const isSecurePrefix = name.startsWith("__Secure-") || name.startsWith("__Host-");
  res.cookies.set({
    name,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    // __Secure- / __Host- prefixes MUST have secure: true or Set-Cookie is rejected.
    secure: isSecurePrefix || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
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
    const orgId = session?.user?.orgId ?? null;
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
            orgId,
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
    // Clear every NextAuth cookie variant (plain + __Secure-) with the EXACT
    // attributes needed for the browser to honor the delete.
    clearSessionCookie(response, "next-auth.session-token");
    clearSessionCookie(response, "__Secure-next-auth.session-token");
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to exit impersonation";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
