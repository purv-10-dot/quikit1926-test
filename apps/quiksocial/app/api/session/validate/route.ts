import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES } from "@quikit/shared";

const APP_SLUG = "quiksocial";

/**
 * GET /api/session/validate
 *
 * Runtime app-access gate, polled by <SessionGuard>. Mirrors the launcher's
 * OAuth-authorize check and the quikscale / quiktrack implementation so every
 * app enforces the same authorization flow:
 *   - membership still active for the selected org
 *   - org itself still active (not suspended by a super-admin)
 *   - org has this app enabled (OrgAppAccess), per-app trial not expired
 *   - non-admin members additionally need an explicit UserAppAccess row
 *
 * Returns { valid: false, reason } when any check fails; the guard signs the
 * user out (→ /login → launcher /apps) on app_access_revoked.
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

  // Membership + org status. Distinguish a revoked membership ("deactivated")
  // from a super-admin org suspension ("org_suspended") — the SessionGuard
  // routes each to a different place.
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

  // App entitlement. Access is provisioned at the org level via OrgAppAccess;
  // an expired per-app trial revokes it. Org admins / super admins pass on
  // org-level access alone; non-admin members additionally need an explicit
  // UserAppAccess row.
  const app = await db.app.findUnique({
    where: { slug: APP_SLUG },
    select: { id: true },
  });
  if (app) {
    const orgAccess = await db.orgAppAccess.findUnique({
      where: { orgId_appId: { orgId, appId: app.id } },
      select: { enabled: true, trialEndsAt: true },
    });
    const trialExpired =
      !!orgAccess?.trialEndsAt && orgAccess.trialEndsAt.getTime() <= Date.now();
    if (!orgAccess || !orgAccess.enabled || trialExpired) {
      return NextResponse.json({ valid: false, reason: "app_access_revoked" });
    }

    const isAdminTier =
      session.user.isSuperAdmin === true ||
      ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));

    if (!isAdminTier) {
      const appAccess = await db.userAppAccess.findUnique({
        where: {
          userId_orgId_appId: { userId: session.user.id, orgId, appId: app.id },
        },
        select: { id: true },
      });
      if (!appAccess) {
        return NextResponse.json({ valid: false, reason: "app_access_revoked" });
      }
    }
  }

  return NextResponse.json({ valid: true, hasTenant: true });
}
