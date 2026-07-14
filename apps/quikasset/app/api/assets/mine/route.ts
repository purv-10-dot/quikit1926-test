import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { employeeIdForEmail } from "@/lib/api/assetScope";

const auth = withOrgAuthForResource("Asset");

/**
 * GET /api/assets/mine — assets currently assigned to the signed-in user,
 * regardless of role. Members use this for their "My Assets" view; managers/
 * admins can call it too (their own assignments). Always scoped to the caller
 * via the email-match STOPGAP (see lib/api/assetScope.ts). Gated on `Asset:view`.
 *
 * Returns each asset enriched with its active assignment metadata so the UI can
 * show when/how it was assigned.
 */
export const GET = auth.view(async ({ orgId, userEmail }) => {
  const employeeId = await employeeIdForEmail(orgId, userEmail);
  if (!employeeId) return NextResponse.json({ success: true, data: [] });

  const assignments = await db.astAssignment.findMany({
    where: { orgId, userId: employeeId, status: "Active" },
    orderBy: { assignedAt: "desc" },
    include: {
      asset: { include: { baseCategory: true, category: true } },
    },
  });

  const data = assignments.map((a) => ({
    ...a.asset,
    assignment: {
      id: a.id,
      assignedAt: a.assignedAt,
      condition: a.condition,
      expectedReturn: a.expectedReturn,
    },
  }));

  return NextResponse.json({ success: true, data });
});
