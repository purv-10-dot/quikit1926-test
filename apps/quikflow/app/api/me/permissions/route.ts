import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { loadMyPermissions } from "@/lib/api/permissions";
import { seedAllDefaultRoles, ensureUserOnRole, collapseToLatestRole } from "@/lib/api/seedAdminAppRole";

// GET /api/me/permissions
// Returns the current user's effective permission set for QuikFlow in the
// active org. Used by the client-side gate (sidebar filter, button hide,
// route guards).
//
// SIDE EFFECT — seed bootstrap: this is a cheap "on-app-startup" hook to
// call `seedAllDefaultRoles(orgId)`, which creates the org's admin AppRole +
// the default "Member" AppRole on first call. The seed is in-process cached
// per org for 5min, so the real DB work happens once per process per org.
//
// SELF-SERVE BIND: an org/super admin who holds no QuikFlow role yet (e.g.
// the app was just granted access, or self-serve provisioning never ran the
// invite flow) is bound to the freshly-seeded admin role here so they don't
// land with an empty sidebar. Idempotent; other binding flows still own
// their cases (invite accept, /api/internal/provision-roles).
//
// Mirrors apps/quikscale/app/api/me/permissions/route.ts.
export const GET = withOrgAuth(async ({ session, userId, orgId }) => {
  try {
    const { adminRoleId } = await seedAllDefaultRoles(orgId);
    const isAdminTier =
      session.user.isSuperAdmin === true ||
      ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));
    if (isAdminTier) {
      const hasRole = await db.wfUserAppRole.findFirst({
        where: { userId, orgId },
        select: { id: true },
      });
      if (!hasRole) await ensureUserOnRole(userId, orgId, adminRoleId);
    }

    // SELF-HEAL — enforce a single QuikFlow role per user (see
    // collapseToLatestRole doc comment for why this is needed).
    await collapseToLatestRole(userId, orgId);
  } catch {
    // Swallow — seed/bind/self-heal is best-effort, retried on the next mount.
  }
  const data = await loadMyPermissions(userId, orgId);
  return NextResponse.json({ success: true, data });
});
