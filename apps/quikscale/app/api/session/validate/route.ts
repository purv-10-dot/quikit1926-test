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

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ valid: true, hasTenant: false });
  }

  // Check 1: Is the membership still active, and is the org itself active?
  // We pull the org status alongside the membership so we can distinguish a
  // revoked membership ("deactivated") from a super-admin org suspension
  // ("org_suspended") — the SessionGuard routes each to a different place.
  const membership = await db.orgMember.findFirst({
    where: {
      userId: session.user.id,
      orgId,
      status: "active",
    },
    select: { id: true, org: { select: { status: true } } },
  });

  if (!membership) {
    return NextResponse.json({ valid: false, reason: "deactivated" });
  }

  // Org suspended/archived by a super-admin → the whole org is off-limits.
  if (membership.org.status !== "active") {
    return NextResponse.json({ valid: false, reason: "org_suspended" });
  }

  // Check 2: Does the user still have QuikScale app access?
  const app = await db.app.findUnique({
    where: { slug: QUIKSCALE_APP_SLUG },
  });

  if (app) {
    const appAccess = await db.userAppAccess.findUnique({
      where: {
        userId_orgId_appId: {
          userId: session.user.id,
          orgId,
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
