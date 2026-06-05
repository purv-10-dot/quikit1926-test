import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { loadMyPermissions } from "@/lib/rbac/permissions";
import { seedAllDefaultRoles } from "@/lib/rbac/seedDefaultRoles";

/**
 * GET /api/me/permissions
 *
 * Returns the current user's effective QuikSocial permission set for
 * their active org. Powers the client-side gate (sidebar filter, button
 * hide, route guards). Cached at the React-Query level on the client —
 * no need to fetch per action.
 *
 * SIDE EFFECT — seed bootstrap: every authenticated client mounts a
 * useMyPermissions hook that hits this endpoint. We use it as a cheap
 * "on-app-startup" hook to call `seedAllDefaultRoles(orgId)`, which:
 *   - creates the org's Admin QsAppRole + full grants on first call
 *   - creates the org's default User QsAppRole + view-only grants on first call
 *   - tops up either role with any newly added registry entries
 *
 * The seed is in-process cached per org for 5 min, so the real DB work
 * happens once per process per org. Failures here MUST NOT break the
 * permission fetch — swallowed in the try/catch.
 */
export const GET = withOrgAuth(async ({ userId, orgId }) => {
  try {
    await seedAllDefaultRoles(orgId);
  } catch {
    // Best-effort. Admin can re-trigger via the central super-admin flow
    // hitting /api/internal/provision-roles if the lazy seed keeps failing.
  }
  const data = await loadMyPermissions(userId, orgId);
  return NextResponse.json({ success: true, data });
});
