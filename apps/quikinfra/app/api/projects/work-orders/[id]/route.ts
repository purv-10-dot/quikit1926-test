import type { Prisma } from "@prisma/client";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenantUpdate, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
} from "@/lib/approvals/approval-dto";

function enrichWO(
  row: Prisma.CnWorkOrderGetPayload<{ include: { lines: true } }>,
  project?: { name?: string | null } | null,
  contractor?: { name?: string | null } | null,
  activityCodeById?: Map<string, string>,
) {
  const lines = (row.lines ?? []).map((l) => {
    // Activity lines store boqItemId = null — show the activity's code instead.
    const code =
      l.scopeType === "ACTIVITY" && l.scopeId
        ? activityCodeById?.get(l.scopeId) ?? l.boqItemId ?? ""
        : l.boqItemId ?? "";
    return {
    id: l.id,
    lineType: l.lineType ?? "boq",
    boqNo: code,
    boqItemId: code,
    scopeType: l.scopeType ?? null,
    scopeId: l.scopeId ?? null,
    description: l.description ?? "",
    uomCode: l.uomCode ?? "",
    quantity: l.quantity?.toString?.() ?? "0",
    rate: l.negotiatedRate?.toString?.() ?? "0",
    amount: l.amount?.toString?.() ?? "0",
    lineDate: l.lineDate?.toISOString?.().slice(0, 10) ?? "",
    activityName: l.activityName ?? "",
    workCategoryId: l.workCategoryId ?? "",
    labourCategoryId: (l as { labourCategoryId?: string | null }).labourCategoryId ?? "",
    labourCount: (l as { labourCount?: { toString?: () => string } | null }).labourCount?.toString?.() ?? "",
    };
  });
  return {
    id: row.id,
    woNumber: row.woNumber,
    orgId: row.orgId,
    projectId: row.projectId,
    projectName: project?.name ?? "",
    contractorId: row.contractorId,
    contractorName: contractor?.name ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    type: "Work Order",
    workType: row.workType ?? null,
    plannedStart: row.startDate?.toISOString?.().slice(0, 10) ?? null,
    plannedEnd: row.endDate?.toISOString?.().slice(0, 10) ?? null,
    retentionPct: 0,
    securityDepositPct: 0,
    tdsPct: 0,
    boqItems: lines,
    lines,
    lineCount: lines.length,
    totalAmount: parseFloat(row.totalAmount?.toString?.() ?? "0"),
    progressPct: 0,
    status: row.status,
    approvalId: row.approvalId ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

async function activityCodesFor(
  orgId: string,
  row: { lines?: Array<{ scopeType?: string | null; scopeId?: string | null }> },
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      (row.lines ?? [])
        .filter((l) => l.scopeType === "ACTIVITY" && l.scopeId)
        .map((l) => l.scopeId as string),
    ),
  ];
  if (!ids.length) return new Map();
  const acts = await db.cnActivityItem.findMany({
    where: { orgId, id: { in: ids } },
    select: { id: true, activityCode: true },
  });
  return new Map(acts.map((a) => [a.id, a.activityCode]));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.wo", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await db.cnWorkOrder.findFirst({
    where: { id: params.id, orgId: ctx.orgId},
    include: {
      lines: true,
      project: { select: { id: true, name: true, code: true } },
      contractor: { select: { id: true, name: true } },
    },
  });
  if (!row) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  // Join the approval instance (if any) so the detail page can render
  // the timeline without a second fetch.
  let approval: ApprovalDto | null = null;
  if (row.approvalId) {
    const instance = await db.cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: ctx.orgId},
      include: APPROVAL_INSTANCE_INCLUDE,
    });
    if (instance) {
      const userIds = Array.from(
        new Set<string>([
          instance.requestedById,
          ...instance.history.map((h) => h.actionById),
          ...(instance.workflow.steps
            .map((s) => s.approverUserId)
            .filter(Boolean) as string[]),
        ]),
      );
      const nameById = await resolveUserNames(userIds);
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
  }

  const rowApprovedBy = (row as { approvedBy?: string | null }).approvedBy;
  const auditNames = await resolveUserNames([
    row.createdBy,
    row.updatedBy,
    rowApprovedBy,
  ]);

  // Progress: quantity recorded against this WO through APPROVED DPRs
  // (CnDPRWorkItem.woId) over the WO's total scoped qty (sum of line
  // quantities). Mirrors the list route so the detail card fills as
  // site work is reported instead of showing a static 0%.
  const scopeQty = (row.lines ?? []).reduce(
    (sum, l) => sum + Number(l.quantity ?? 0),
    0,
  );
  const dprItems = await db.cnDPRWorkItem.findMany({
    where: { woId: row.id, dpr: { orgId: ctx.orgId, status: "approved" } },
    select: { todayQty: true },
  });
  const doneQty = dprItems.reduce((sum, it) => sum + Number(it.todayQty ?? 0), 0);
  const progressPct =
    scopeQty > 0 ? Math.min(100, Math.round((doneQty / scopeQty) * 100)) : 0;

  const activityCodeById = await activityCodesFor(ctx.orgId, row);
  return NextResponse.json({
    ...enrichWO(row, row.project, row.contractor, activityCodeById),
    progressPct,
    approval,
    createdByName: auditNames.get(row.createdBy) ?? row.createdBy,
    updatedByName: auditNames.get(row.updatedBy) ?? row.updatedBy,
    approvedByName: rowApprovedBy
      ? auditNames.get(rowApprovedBy) ?? rowApprovedBy
      : null,
  });
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.wo", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "pm.work_order", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for pm.work_order`, 403);
  }

  const body = await req.json();
  const {
    id: _a,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    ...safe
  } = body ?? {};

  const existing = await db.cnWorkOrder.findFirst({
    where: { id, orgId: ctx.orgId},
    select: { id: true, createdBy: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "work order");
  if (guard) return guard;

  // Build update payload from supported fields only. (Remaining demo-only
  // fields like retentionPct/tdsPct are still display-only and dropped.)
  const data: Record<string, unknown> = {};
  if (safe.title !== undefined) data.title = safe.title;
  if (safe.description !== undefined) data.description = safe.description;
  if (safe.contractorId !== undefined) data.contractorId = safe.contractorId;
  if (safe.workCategoryId !== undefined) data.workCategoryId = safe.workCategoryId;
  if (safe.workType !== undefined) data.workType = safe.workType ?? null;
  if (safe.plannedStart !== undefined && safe.plannedStart !== null) {
    data.startDate = new Date(safe.plannedStart);
  }
  if (safe.plannedEnd !== undefined && safe.plannedEnd !== null) {
    data.endDate = new Date(safe.plannedEnd);
  }
  if (safe.status !== undefined) data.status = safe.status;
  if (safe.approvalId !== undefined) data.approvalId = safe.approvalId;
  if (safe.termsConditionId !== undefined) data.termsConditionId = safe.termsConditionId;

  // Re-roll totals when boqItems is included in the update.
  let totalAmount: number | null = null;
  let boqItems: Array<{
    boqNo?: string | null;
    boqItemId?: string | null;
    description?: string | null;
    quantity?: number | string | null;
    uomId?: string | null;
    uomCode?: string | null;
    rate?: number | string | null;
    amount?: number | string | null;
    lineType?: string | null;
    lineDate?: string | null;
    activityName?: string | null;
    workCategoryId?: string | null;
    labourCategoryId?: string | null;
    labourCount?: number | string | null;
  }> | null = null;
  const bi = safe.boqItems;
  if (Array.isArray(bi)) {
    boqItems = bi;
    totalAmount = bi.reduce(
      (sum: number, it: { amount?: number | string | null }) =>
        sum + (Number(it.amount) || 0),
      0,
    );
    data.totalAmount = String(totalAmount);
  }

  await db.$transaction(async (tx) => {
    await tx.cnWorkOrder.update({
      where: { id },
      data: tenantUpdate(ctx, data),
    });
    if (boqItems) {
      // Replace all lines wholesale (labour counts are plain columns).
      await tx.cnWorkOrderLine.deleteMany({ where: { woId: id } });
      if (boqItems.length > 0) {
        await tx.cnWorkOrderLine.createMany({
          data: boqItems.map((it) => ({
            woId: id,
            lineType: (it.lineType as string) ?? "boq",
            boqItemId: String(it.boqNo ?? it.boqItemId ?? ""),
            description: String(it.description ?? ""),
            quantity: String(Number(it.quantity) || 0),
            uomCode: String(it.uomCode ?? it.uomId ?? ""),
            negotiatedRate: String(Number(it.rate) || 0),
            amount: String(Number(it.amount) || 0),
            lineDate: it.lineDate ? new Date(it.lineDate) : null,
            activityName: it.activityName ?? null,
            workCategoryId: it.workCategoryId ?? null,
            labourCategoryId: it.labourCategoryId ?? null,
            labourCount: it.labourCount != null ? String(it.labourCount) : null,
          })),
        });
      }
    }
  });

  const next = await db.cnWorkOrder.findFirst({
    where: { id },
    include: {
      lines: true,
      project: { select: { id: true, name: true, code: true } },
      contractor: { select: { id: true, name: true } },
    },
  });
  if (!next) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }
  const activityCodeById = await activityCodesFor(next.orgId, next);
  return NextResponse.json(enrichWO(next, next.project, next.contractor, activityCodeById));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handleUpdate(req, params.id);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return handleUpdate(req, params.id);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.wo", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "pm.work_order", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for pm.work_order`, 403);
  }

  const existing = await db.cnWorkOrder.findFirst({
    where: { id: params.id, orgId: ctx.orgId},
    select: { id: true, createdBy: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "work order");
  if (guard) return guard;

  // Soft delete via status flip — preserves the row + lines for audit.
  const res = await db.cnWorkOrder.updateMany({
    where: { id: params.id, orgId: ctx.orgId},
    data: { status: "inactive", updatedBy: ctx.userId },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
