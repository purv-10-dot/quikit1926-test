import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { userCan, forbidden } from "@/lib/api/permissions";

/**
 * Unified admin feed for the "Employee Requests" page — the approver queues for
 * AstAssetRequest and AstRepairRequest in one call. Returns the two as SEPARATE
 * typed arrays (not a lossy normalized merge) so the page can reuse the existing
 * per-type dialogs; it merges/sorts/filters client-side.
 *
 * Gating is per-type viewAll, OR'd: a caller sees asset requests only if they
 * hold `AssetRequest:viewAll`, repair requests only if `RepairRequest:viewAll`.
 * Holding neither is a 403. This mirrors the gate the two individual queue
 * endpoints already enforce (this endpoint always returns the FULL org queue —
 * the employee "mine" views keep using the individual `?mine=1` endpoints).
 */
export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const [canAssets, canRepairs] = await Promise.all([
    userCan(userId, orgId, "AssetRequest", "viewAll"),
    userCan(userId, orgId, "RepairRequest", "viewAll"),
  ]);
  if (!canAssets && !canRepairs) return forbidden();

  const assetRequests = canAssets ? await listAssetRequests(orgId) : [];
  const repairRequests = canRepairs ? await listRepairRequests(orgId) : [];

  return NextResponse.json({ success: true, data: { assetRequests, repairRequests } });
});

/**
 * Full asset-request queue, enriched to match `/api/asset-requests` (GET) output:
 * requester name/code via the AstEmployee identity bridge and base-category name
 * — both loose (no-FK) joins done in app code.
 */
async function listAssetRequests(orgId: string) {
  const requests = await db.astAssetRequest.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });

  const userIds = [...new Set(requests.map((r) => r.requesterUserId))];
  const employees = userIds.length
    ? await db.astEmployee.findMany({
        where: { orgId, userId: { in: userIds } },
        select: { userId: true, name: true, employeeId: true },
      })
    : [];
  const byUser = new Map(employees.map((e) => [e.userId, e]));

  const baseCatIds = [...new Set(requests.map((r) => r.baseCategoryId).filter((id): id is string => !!id))];
  const baseCats = baseCatIds.length
    ? await db.astBaseCategory.findMany({ where: { orgId, id: { in: baseCatIds } }, select: { id: true, name: true } })
    : [];
  const baseCatById = new Map(baseCats.map((b) => [b.id, b.name]));

  return requests.map((r) => ({
    ...r,
    requesterName: byUser.get(r.requesterUserId)?.name ?? null,
    requesterEmployeeId: byUser.get(r.requesterUserId)?.employeeId ?? null,
    baseCategoryName: r.baseCategoryId ? baseCatById.get(r.baseCategoryId) ?? null : null,
  }));
}

/**
 * Full repair-request queue, enriched to match `/api/repair-requests` (GET)
 * output: the joined asset (name/code/category) flattened onto the row, plus the
 * requester name/code via the identity bridge.
 */
async function listRepairRequests(orgId: string) {
  const requests = await db.astRepairRequest.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      asset: { select: { itemName: true, itemCode: true, category: { select: { name: true } } } },
    },
  });

  const userIds = [...new Set(requests.map((r) => r.requesterUserId))];
  const employees = userIds.length
    ? await db.astEmployee.findMany({
        where: { orgId, userId: { in: userIds } },
        select: { userId: true, name: true, employeeId: true },
      })
    : [];
  const byUser = new Map(employees.map((e) => [e.userId, e]));

  return requests.map((r) => {
    const { asset, ...rest } = r;
    return {
      ...rest,
      assetName: asset?.itemName ?? null,
      assetCode: asset?.itemCode ?? null,
      assetCategoryName: asset?.category?.name ?? null,
      requesterName: byUser.get(r.requesterUserId)?.name ?? null,
      requesterEmployeeId: byUser.get(r.requesterUserId)?.employeeId ?? null,
    };
  });
}
