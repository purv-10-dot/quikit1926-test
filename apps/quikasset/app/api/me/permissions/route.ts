import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { loadMyPermissions } from "@/lib/api/permissions";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAppRoles";

// GET /api/me/permissions
// Returns the current user's effective permission set for QuikAsset in the
// active org. Powers the client-side gate (sidebar, button-hide, route guards)
// via the `useMyPermissions` hook.
//
// SIDE EFFECT: fires `seedAllDefaultRoles(orgId)` so fresh tenants get the
// admin + default Member role created on first request. The seeder is cached
// per process per org (5-min TTL), so real DB writes happen at most once per
// process per org.
//
// SELF-SERVE BIND: self-serve registration creates the Org + an org_admin
// membership but never runs the invite/provision flows that bind a user to an
// app role, so a fresh org admin would land with zero permissions (empty
// sidebar). If the caller is an org/super admin and holds no QuikAsset role
// yet, bind them to the freshly-seeded admin role. Idempotent.
export const GET = withOrgAuth(async ({ session, userId, orgId }) => {
  try {
    const { adminRoleId } = await seedAllDefaultRoles(orgId);
    const isAdminTier =
      session.user.isSuperAdmin === true ||
      ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));
    if (isAdminTier) {
      const hasRole = await db.astUserAppRole.findFirst({
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
