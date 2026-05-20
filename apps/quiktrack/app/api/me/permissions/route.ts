import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { loadMyPermissions } from "@/lib/api/permissions";
import { seedAllDefaultRoles } from "@/lib/api/seedAdminAppRole";

// GET /api/me/permissions
// Returns the current user's effective permission set for QuikTrack in the
// active org. Powers the client-side gate (sidebar, button-hide, route
// guards) via the `useMyPermissions` hook.
//
// SIDE EFFECT: fires `seedAllDefaultRoles(orgId)` so fresh tenants get the
// admin + default User role created on first request. The seeder is cached
// per process per org (5-min TTL), so real DB writes happen at most once
// per process per org.
export const GET = withOrgAuth(async ({ userId, orgId }) => {
  try {
    await seedAllDefaultRoles(orgId);
  } catch {
    // Best-effort. Permission fetch must still succeed.
  }
  const data = await loadMyPermissions(userId, orgId);
  return NextResponse.json({ success: true, data });
});
