import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimitAsync, LIMITS, getClientIp } from "@/lib/api/rateLimit";

const QUIKSCALE_APP_SLUG = "quikscale";

/**
 * GET /api/session/validate
 * Checks if the current user still has:
 * 1. An active membership for the selected tenant
 * 2. An active app access record for QuikScale
 * Returns { valid: false } if either check fails.
 */
export async function GET(request: NextRequest) {
  // Rate limit: 100 checks/min per IP
  const rl = await rateLimitAsync({
    routeKey: "session:validate",
    clientKey: getClientIp(request),
    limit: 100,
    windowMs: 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { valid: true, rateLimited: true },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, reason: "unauthenticated" });
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ valid: true, hasTenant: false });
  }

  // Check 1: Is the membership still active?
  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      tenantId,
      status: "active",
    },
  });

  if (!membership) {
    return NextResponse.json({ valid: false, reason: "deactivated" });
  }

  // Check 2: Does the user still have QuikScale app access?
  const app = await db.app.findUnique({
    where: { slug: QUIKSCALE_APP_SLUG },
  });

  if (app) {
    const appAccess = await db.userAppAccess.findUnique({
      where: {
        userId_tenantId_appId: {
          userId: session.user.id,
          tenantId,
          appId: app.id,
        },
      },
    });

    if (!appAccess) {
      return NextResponse.json({ valid: false, reason: "app_access_revoked" });
    }
  }

  return NextResponse.json({ valid: true, hasTenant: true });
}
