import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES } from "@quikit/shared";

const APP_SLUG = "quikchat";

/**
 * GET /api/session/validate — live-revocation probe for `SessionGuard`.
 * Returns `{ valid, reason }` so the client can bounce a user whose session,
 * org, or app access was revoked WHILE they were inside QuikChat. Ported from
 * quiktrack (identical rule); this deliberately returns a body on 200 rather
 * than throwing, so it does not use withOrgAuth.
 */
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, reason: "unauthenticated" });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ valid: true, hasTenant: false });
  }

  const membership = await db.orgMember.findFirst({
    where: { userId: session.user.id, orgId, status: "active" },
    select: { id: true, org: { select: { status: true } } },
  });
  if (!membership) {
    return NextResponse.json({ valid: false, reason: "deactivated" });
  }
  if (membership.org.status !== "active") {
    return NextResponse.json({ valid: false, reason: "org_suspended" });
  }

  const app = await db.app.findUnique({ where: { slug: APP_SLUG }, select: { id: true } });
  if (app) {
    const orgAccess = await db.orgAppAccess.findUnique({
      where: { orgId_appId: { orgId, appId: app.id } },
      select: { enabled: true, trialEndsAt: true },
    });
    const trialExpired = !!orgAccess?.trialEndsAt && orgAccess.trialEndsAt.getTime() <= Date.now();
    if (!orgAccess || !orgAccess.enabled || trialExpired) {
      return NextResponse.json({ valid: false, reason: "app_access_revoked" });
    }

    const isAdminTier =
      session.user.isSuperAdmin === true ||
      ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));
    if (!isAdminTier) {
      const appAccess = await db.userAppAccess.findUnique({
        where: { userId_orgId_appId: { userId: session.user.id, orgId, appId: app.id } },
        select: { id: true },
      });
      if (!appAccess) {
        return NextResponse.json({ valid: false, reason: "app_access_revoked" });
      }
    }
  }

  return NextResponse.json({ valid: true, hasTenant: true });
}
