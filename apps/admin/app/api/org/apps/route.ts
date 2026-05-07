import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { db } from "@/lib/db";

/**
 * GET /api/org/apps — apps the current org is provisioned for.
 *
 * Used by the Org Admin "Invite Member" form to populate the Application
 * Access multi-select (FR-OA-002). Only returns apps where the org has an
 * enabled OrgAppAccess row AND the App itself is active.
 */
export const GET = withAdminAuth(async ({ orgId }, _request: NextRequest) => {
  const accesses = await db.orgAppAccess.findMany({
    where: { orgId, enabled: true },
    select: {
      appId: true,
      app: { select: { id: true, name: true, slug: true, status: true } },
    },
  });

  const data = accesses
    .filter((a) => a.app && a.app.status === "active")
    .map((a) => ({ id: a.app!.id, name: a.app!.name, slug: a.app!.slug }));

  return NextResponse.json({ success: true, data });
});
