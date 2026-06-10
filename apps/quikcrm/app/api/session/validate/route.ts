import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/session/validate
 *
 * Polled by the shared SessionGuard (mirrors apps/admin). Confirms the current
 * user still has an active membership for the selected org so the guard can
 * sign out deactivated users.
 *
 * NOTE: unlike apps/quikscale, QuikCRM does NOT gate on UserAppAccess here.
 * QuikCRM's access model (lib/auth/require.ts) grants the app to any org
 * member with a valid OAuth session. UserAppAccess rows are only provisioned
 * for users created via CRM settings (lib/services/settings/users.service.ts
 * -> ensureQuikCrmAppAccess) and merely drive launcher-tile visibility — they
 * are NOT a login gate. Re-checking them here would falsely log out launcher
 * handoff / super-admin users who never received a row (reason=app_revoked).
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

  // Is the membership still active? (deactivation / removal logs the user out)
  const membership = await db.orgMember.findFirst({
    where: { userId: session.user.id, orgId, status: "active" },
    select: { role: true },
  });

  if (!membership) {
    return NextResponse.json({ valid: false, reason: "deactivated" });
  }

  return NextResponse.json({ valid: true, hasTenant: true });
}
