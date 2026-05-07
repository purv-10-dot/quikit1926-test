import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { loadMyPermissions } from "@/lib/api/permissions";

// GET /api/me/permissions
// Returns the current user's effective permission set for QuikScale in the
// active org. Used by the client-side gate (sidebar filter, button hide,
// route guards). Cached at the React-Query level — no need to fetch per
// action.
export const GET = withOrgAuth(async ({ userId, orgId }) => {
  const data = await loadMyPermissions(userId, orgId);
  return NextResponse.json({ success: true, data });
});
