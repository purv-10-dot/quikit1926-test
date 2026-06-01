/**
 * GET /api/me/permissions
 *
 * Returns the effective permission set for the current user in their active
 * org. Also acts as the seed orchestrator — every authenticated request
 * triggers seedDefaultRoles(orgId), which is idempotent + 5-min cached
 * per process.
 *
 * Response shape:
 *   { success: true, data: {
 *       isAdmin:  boolean,                 // user holds the system "admin" role
 *       roleId:   string | null,           // primary CnUserAppRole.roleId
 *       roleName: string | null,           // primary role's display name
 *       permissions: string[],             // union of role grants + extras
 *       extras:      string[]              // subset granted via UserPermissionExtra
 *   }}
 *
 * Mirrors apps/quikscale/app/api/me/permissions/route.ts.
 */

import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { loadMyPermissions } from "@/lib/rbac/userCan";
import { seedDefaultRoles } from "@/lib/rbac/seedDefaultRoles";

export const GET = withOrgAuth(async ({ userId, orgId }) => {
  // Fire-and-forget seed: failures must not break the permission fetch.
  try {
    await seedDefaultRoles(orgId);
  } catch {
    // Swallow — seed is best-effort. The admin can re-trigger via UI.
  }
  const data = await loadMyPermissions(userId, orgId);
  return NextResponse.json({ success: true, data });
});
