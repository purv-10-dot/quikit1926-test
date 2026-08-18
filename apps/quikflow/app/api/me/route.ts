import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * GET /api/me — the caller's identity + resolved role in the active org, so the
 * client (e.g. the builder's scope picker) knows whether org-wide workflows are
 * allowed without duplicating the RBAC logic. `isAdmin` reflects the v2 AppRole
 * grant, not the legacy session tier.
 */
export const GET = withOrgAuth(async ({ userId, orgId, isAdmin }) => {
  return NextResponse.json({ success: true, data: { userId, orgId, isAdmin } });
});
