import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES } from "@quikit/shared";

const QUIKCRM_APP_SLUG = "quikcrm";

/**
 * GET /api/session/validate
 *
 * Polled by the shared SessionGuard. Confirms the current user still has:
 *   1. An active membership for the selected org (else `deactivated`)
 *   2. An active org (else `org_suspended`)
 *   3. App access to QuikCRM (else `app_access_revoked`)
 *
 * Access model — identical to quikscale and to the launcher visibility rule
 * (apps/quikit/app/api/apps/launcher/route.ts):
 *   - The org must have OrgAppAccess.enabled = true for QuikCRM (an expired
 *     per-app trial revokes it).
 *   - Org admins / super admins pass on org-level access alone.
 *   - Non-admin members additionally need an explicit UserAppAccess row.
 *
 * Previously QuikCRM did NOT gate on app access here — any org member reached
 * the dashboard, so a user granted only some other app (e.g. QuikHRMS) still
 * got in. That diverged from every other app. This restores parity so the
 * shared SessionGuard bounces ungranted users to the landing page + access
 * popup (reason=app_access_revoked). Super admins and org admins are exempt
 * (they pass on org-level access), and launcher-handoff users always hold a
 * UserAppAccess row for the app they launched — so neither is falsely evicted.
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ valid: false, reason: "unauthenticated" });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ valid: true, hasTenant: false });
  }

  // Check 1: membership still active, and the org itself still active.
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

  // Check 2: does the user still have access to QuikCRM?
  const app = await db.app.findUnique({
    where: { slug: QUIKCRM_APP_SLUG },
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
