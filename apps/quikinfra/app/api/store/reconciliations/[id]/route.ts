import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

import { resolveUserNames } from "@/lib/users/resolve-names";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
  type ApprovalInstanceFull,
} from "@/lib/approvals/approval-dto";

/**
 * GET /api/store/reconciliations/:id
 *
 * Returns the full reconciliation row with joined project, location,
 * and line items (each enriched with the item's code/name + uom code).
 * Audit fields (createdByName / updatedByName / approvedByName) are
 * resolved server-side so the detail page renders human names instead
 * of cuids.
 */
/** A reconciliation line as stored in the JSONB `materials` column. */
interface ReconLine {
  id?: string | null;
  itemId?: string | null;
  uomId?: string | null;
  systemQty?: number | string | null;
  physicalQty?: number | string | null;
  varianceQty?: number | string | null;
  reason?: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.reconciliation", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const row = await db.cnStockReconciliation.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
    include: {
      project: { select: { id: true, name: true, code: true } },
    },
  });
  if (!row) {
    return NextResponse.json(
      { error: "Reconciliation not found" },
      { status: 404 },
    );
  }

  // Project-scope guard — a user assigned to a subset of projects
  // shouldn't be able to deep-link into a row outside that subset.
  if (
    Array.isArray(ctx.projectIds) &&
    ctx.projectIds.length > 0 &&
    !ctx.projectIds.includes(row.projectId)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reconLines: ReconLine[] = Array.isArray(row.materials)
    ? (row.materials as unknown as ReconLine[])
    : [];

  // Batch-fetch line dependencies — item + uom — in two queries.
  const itemIds = Array.from(
    new Set(
      (reconLines)
        .map((l) => l.itemId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const uomIds = Array.from(
    new Set(
      (reconLines)
        .map((l) => l.uomId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const [itemsRaw, uomsRaw, locationRow] = await Promise.all([
    itemIds.length
      ? db.cnItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    uomIds.length
      ? db.cnUOM.findMany({
          where: { id: { in: uomIds } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
    row.locationId
      ? db.cnLocation.findFirst({
          where: { id: row.locationId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);
  const itemById = new Map(itemsRaw.map((i): [string, (typeof itemsRaw)[number]] => [i.id, i]));
  const uomById = new Map(uomsRaw.map((u): [string, (typeof uomsRaw)[number]] => [u.id, u]));

  // Load the approval instance (if any) + workflow + history. Same
  // fan-out the other detail routes do so the shared ApprovalTimeline
  // component renders without an adapter on the client.
  let approval: ApprovalDto | null = null;
  let instance: ApprovalInstanceFull | null = null;
  let approvalUserIds: string[] = [];
  if (row.approvalId) {
    instance = await db.cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: ctx.orgId },
      include: APPROVAL_INSTANCE_INCLUDE,
    });
    if (instance) {
      approvalUserIds = [
        instance.requestedById,
        ...instance.history.map((h) => h.actionById),
        ...(instance.workflow.steps
          .map((s) => s.approverUserId)
          .filter(Boolean) as string[]),
      ];
    }
  }

  const userIds = [
    row.createdBy,
    row.updatedBy,
    row.conductedById,
    row.approvedById,
    ...approvalUserIds,
  ].filter(Boolean) as string[];
  const nameById = await resolveUserNames(userIds);

  if (instance) {
    const callerCanActOnCurrentStep = canActOnCurrentStep(
      {
        userId: ctx.userId,
        roleKey: ctx.roleKey,
        projectIds: ctx.projectIds,
      },
      instance,
      row.projectId ?? null,
    );
    approval = buildApprovalDto(instance, nameById, callerCanActOnCurrentStep);
  }

  const lines = (reconLines).map((l, idx) => {
    const item = itemById.get(l.itemId ?? "");
    const uom = uomById.get(l.uomId ?? "");
    const systemQty = Number(l.systemQty?.toString?.() ?? l.systemQty ?? 0);
    const physicalQty = Number(l.physicalQty?.toString?.() ?? l.physicalQty ?? 0);
    const varianceQty = Number(
      l.varianceQty?.toString?.() ?? l.varianceQty ?? physicalQty - systemQty,
    );
    return {
      id: l.id,
      lineNo: idx + 1,
      itemId: l.itemId,
      itemCode: item?.code ?? "",
      itemName: item?.name ?? l.itemId,
      uomId: l.uomId,
      uomCode: uom?.code ?? "",
      systemQty,
      physicalQty,
      varianceQty,
      reason: l.reason ?? "",
    };
  });

  return NextResponse.json({
    id: row.id,
    reconciliationNumber: row.reconciliationNumber,
    projectId: row.projectId,
    projectName: row.project?.name ?? "",
    projectCode: row.project?.code ?? "",
    locationId: row.locationId,
    locationName: locationRow?.name ?? "",
    reconciliationDate:
      row.reconciliationDate?.toISOString?.().slice(0, 10) ?? "",
    conductedById: row.conductedById,
    // The typed name wins; rows created before that column existed fall back
    // to the display name of the user recorded on the FK.
    conductedByName:
      row.conductedByName ??
      ((row.conductedById && nameById.get(row.conductedById)) ?? null),
    approvedById: row.approvedById,
    approvedByName:
      (row.approvedById && nameById.get(row.approvedById)) ?? null,
    approvalId: row.approvalId ?? null,
    approval,
    status: row.status,
    lineCount: lines.length,
    lines,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    createdBy: row.createdBy,
    createdByName: (row.createdBy && nameById.get(row.createdBy)) ?? null,
    updatedBy: row.updatedBy,
    updatedByName: (row.updatedBy && nameById.get(row.updatedBy)) ?? null,
  });
}
