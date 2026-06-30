import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { loadMyPermissions } from "@/lib/api/permissions";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAdminAppRole";

// GET /api/me/permissions
// Returns the current user's effective permission set for QuikScale in the
// active org. Used by the client-side gate (sidebar filter, button hide,
// route guards). Cached at the React-Query level — no need to fetch per
// action.
//
// SIDE EFFECT — seed bootstrap: every authenticated client mounts the
// `useMyPermissions` hook, which fires this endpoint. We use it as a cheap
// "on-app-startup" hook to call `seedAllDefaultRoles(orgId)`, which:
//   - creates the org's admin AppRole + grants on first call
//   - creates the org's default "User" AppRole + grants on first call
//   - backfills any legacy OPSP RolePermission rows once
// The seed is in-process cached per org for 5min, so the real DB work
// happens once per process per org.
//
// SELF-SERVE BIND: self-serve registration creates the Org + an org_admin
// membership but never runs the invite/provision flows (POST /api/org/users,
// /api/internal/provision-roles, invitation accept) that bind a user to an
// app role. Without a UserAppRole the admin lands with zero permissions —
// an empty sidebar. So if the caller is an org/super admin and holds no
// QuikScale role yet, bind them to the freshly-seeded admin role here.
// Idempotent; the other binding flows still own their cases.
export const GET = withOrgAuth(async ({ session, userId, orgId }) => {
  // Fire-and-forget: failures must not break the permission fetch.
  try {
    const { adminRoleId } = await seedAllDefaultRoles(orgId);
    const isAdminTier =
      session.user.isSuperAdmin === true ||
      ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));
    if (isAdminTier) {
      const hasRole = await db.userAppRole.findFirst({
        where: { userId, orgId },
        select: { id: true },
      });
      if (!hasRole) await ensureUserOnRole(userId, orgId, adminRoleId);
    }
  } catch {
    // Swallow — seed/bind is best-effort, retried on the next mount.
  }
  const data = await loadMyPermissions(userId, orgId);
  return NextResponse.json({ success: true, data });
});
