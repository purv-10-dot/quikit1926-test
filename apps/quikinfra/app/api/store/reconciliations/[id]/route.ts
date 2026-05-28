import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";

/**
 * GET /api/store/reconciliations/:id
 *
 * Returns the full reconciliation row with joined project, location,
 * and line items (each enriched with the item's code/name + uom code).
 * Audit fields (createdByName / updatedByName / approvedByName) are
 * resolved server-side so the detail page renders human names instead
 * of cuids.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const row = await (db as any).cnStockReconciliation.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      lines: true,
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

  // Batch-fetch line dependencies — item + uom — in two queries.
  const itemIds = Array.from(
    new Set(
      (row.lines as any[])
        .map((l) => l.itemId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const uomIds = Array.from(
    new Set(
      (row.lines as any[])
        .map((l) => l.uomId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  const [itemsRaw, uomsRaw, locationRow] = await Promise.all([
    itemIds.length
      ? (db as any).cnItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    uomIds.length
      ? (db as any).cnUOM.findMany({
          where: { id: { in: uomIds } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
    row.locationId
      ? (db as any).cnLocation.findFirst({
          where: { id: row.locationId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);
  const itemById = new Map<string, any>(itemsRaw.map((i: any) => [i.id, i]));
  const uomById = new Map<string, any>(uomsRaw.map((u: any) => [u.id, u]));

  // Load the approval instance (if any) + workflow + history. Same
  // fan-out the other detail routes do so the shared ApprovalTimeline
  // component renders without an adapter on the client.
  let approval: any = null;
  let approvalUserIds: string[] = [];
  if (row.approvalId) {
    const instance = await (db as any).cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: ctx.orgId },
      include: {
        history: { orderBy: { actionAt: "asc" } },
        workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      },
    });
    if (instance) {
      approvalUserIds = [
        instance.requestedById,
        ...instance.history.map((h: any) => h.actionById),
        ...(instance.workflow.steps
          .map((s: any) => s.approverUserId)
          .filter(Boolean) as string[]),
      ];
      approval = { _instance: instance };
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

  if (approval) {
    const instance = approval._instance;
    const callerCanActOnCurrentStep = canActOnCurrentStep(
      {
        userId: ctx.userId,
        roleKey: ctx.roleKey,
        projectIds: ctx.projectIds,
      },
      instance,
      row.projectId ?? null,
    );
    approval = {
      id: instance.id,
      status: instance.status,
      currentStepOrder: instance.currentStepOrder,
      canActOnCurrentStep: callerCanActOnCurrentStep,
      completedAt: instance.completedAt?.toISOString?.() ?? null,
      requestedAt: instance.requestedAt.toISOString(),
      requestedById: instance.requestedById,
      requestedByName: nameById.get(instance.requestedById) ?? "User",
      workflow: {
        id: instance.workflow.id,
        name: instance.workflow.name,
        steps: instance.workflow.steps.map((s: any) => ({
          stepOrder: s.stepOrder,
          approverRoleId: s.approverRoleId,
          approverUserId: s.approverUserId,
          approverUserName: s.approverUserId
            ? (nameById.get(s.approverUserId) ?? null)
            : null,
        })),
      },
      history: instance.history.map((h: any) => ({
        stepOrder: h.stepOrder,
        action: h.action,
        actionById: h.actionById,
        actionByName: nameById.get(h.actionById) ?? "User",
        actionAt: h.actionAt.toISOString(),
        comments: h.comments,
      })),
    };
  }

  const lines = (row.lines as any[]).map((l, idx) => {
    const item = itemById.get(l.itemId);
    const uom = uomById.get(l.uomId);
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
    conductedByName:
      (row.conductedById && nameById.get(row.conductedById)) ?? null,
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
