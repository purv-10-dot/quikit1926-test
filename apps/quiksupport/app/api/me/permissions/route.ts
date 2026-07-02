import { NextResponse } from "next/server";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { loadMyPermissions } from "@/lib/api/permissions";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAppRole";

/**
 * GET /api/me/permissions
 *
 * Returns the current user's effective QuikSupport (Qsp*) permission set for
 * the active org — the platform-standard shape every QuikIT app exposes,
 * powering the client-side gate via `useMyPermissions`.
 *
 * SIDE EFFECT: fires `seedAllDefaultRoles(orgId)` so fresh orgs get the admin +
 * default Member role on first request (cached per process per org, 5-min TTL).
 *
 * SELF-SERVE BIND: a fresh org admin created via self-serve registration has no
 * Qsp* role yet. If the caller is an org/super admin holding no QuikSupport
 * role, bind them to the freshly-seeded admin role. Idempotent, best-effort.
 */
export const GET = withOrgAuth(async ({ session, userId, orgId }) => {
  try {
    const { adminRoleId } = await seedAllDefaultRoles(orgId);
    const isAdminTier =
      session.user.isSuperAdmin === true ||
      ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));
    if (isAdminTier) {
      const hasRole = await db.qspUserAppRole.findFirst({
        where: { userId, orgId },
        select: { id: true },
      });
      if (!hasRole) await ensureUserOnRole(userId, orgId, adminRoleId);
    }
  } catch {
    // Best-effort. Permission fetch must still succeed.
  }

  const data = await loadMyPermissions(userId, orgId);
  return NextResponse.json({ success: true, data });
});
