import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { loadMyPermissions } from "@/lib/api/permissions";
import { seedAllDefaultRoles } from "@/lib/api/seedAdminAppRole";

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
export const GET = withOrgAuth(async ({ userId, orgId }) => {
  // Fire-and-forget: failures must not break the permission fetch.
  try {
    await seedAllDefaultRoles(orgId);
  } catch {
    // Swallow — seed is best-effort. The admin can re-trigger via UI.
  }
  const data = await loadMyPermissions(userId, orgId);
  return NextResponse.json({ success: true, data });
});
