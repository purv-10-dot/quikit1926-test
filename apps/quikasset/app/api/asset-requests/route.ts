import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";

const auth = withOrgAuthForResource("AssetRequest");

const statusFilter = z
  .enum([
    "Draft",
    "Submitted",
    "PendingApproval",
    "Approved",
    "Rejected",
    "PartiallyFulfilled",
    "Fulfilled",
    "Cancelled",
  ])
  .optional();

/**
 * Asset-request queue. Role-aware, mirroring the `/api/assets` pattern:
 *   - holders of `AssetRequest:viewAll` (approvers/admin) see every request;
 *   - everyone else sees only their own (`requesterUserId == me`).
 * The admin "Pending Approvals" screen is gated on `viewAll`, so it lands here
 * with the full queue; the member "My Requests" view (later) reuses the same
 * endpoint and gets the scoped list for free.
 */
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const { searchParams } = new URL(req.url);
  const parsedStatus = statusFilter.safeParse(searchParams.get("status") ?? undefined);
  if (!parsedStatus.success) {
    return NextResponse.json({ success: false, error: "Invalid status filter" }, { status: 400 });
  }

  const canViewAll = await userCan(userId, orgId, "AssetRequest", "viewAll");

  const requests = await db.astAssetRequest.findMany({
    where: {
      orgId,
      ...(canViewAll ? {} : { requesterUserId: userId }),
      ...(parsedStatus.data ? { status: parsedStatus.data } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  // Resolve requester display names via the AstEmployee.userId identity bridge
  // (requesterUserId is a plain column, not a relation, so we join in app code).
  const userIds = [...new Set(requests.map((r) => r.requesterUserId))];
  const employees = userIds.length
    ? await db.astEmployee.findMany({
        where: { orgId, userId: { in: userIds } },
        select: { userId: true, name: true, email: true },
      })
    : [];
  const byUser = new Map(employees.map((e) => [e.userId, e]));

  const data = requests.map((r) => ({
    ...r,
    requesterName: byUser.get(r.requesterUserId)?.name ?? null,
    requesterEmail: byUser.get(r.requesterUserId)?.email ?? null,
  }));

  return NextResponse.json({ success: true, data });
});
