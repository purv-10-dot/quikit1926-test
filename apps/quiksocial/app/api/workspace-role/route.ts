/**
 * GET /api/workspace-role?brandId=X
 *
 * Returns the caller's role for the given brand.
 * Used by the client-side useWorkspaceRole hook so role-aware UI never
 * has to call into the database from the browser.
 *
 * Ported to QuikIT (Phase 3, Batch 4).
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getWorkspaceRole } from "@/lib/auth/rbac";

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const brandId = new URL(req.url).searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json(
      { success: false, error: "brandId is required" },
      { status: 400 },
    );
  }

  const role = await getWorkspaceRole(orgId, userId, brandId);
  return NextResponse.json({ success: true, data: { role } });
});
