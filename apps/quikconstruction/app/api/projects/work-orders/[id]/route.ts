import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext, tenantUpdate } from "@/lib/auth/context";

function enrichWO(row: any, project?: any, contractor?: any): any {
  const lines = (row.lines ?? []).map((l: any) => ({
    id: l.id,
    boqNo: l.boqItemId ?? "",
    boqItemId: l.boqItemId ?? "",
    description: l.description ?? "",
    uomId: l.uomId ?? "",
    quantity: l.quantity?.toString?.() ?? "0",
    rate: l.negotiatedRate?.toString?.() ?? "0",
    amount: l.amount?.toString?.() ?? "0",
  }));
  return {
    id: row.id,
    woNumber: row.woNumber,
    tenantId: row.tenantId,
    orgId: row.orgId,
    projectId: row.projectId,
    projectName: project?.name ?? "",
    contractorId: row.contractorId,
    contractorName: contractor?.name ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    type: "Work Order",
    workType: "Without Material",
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

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const row = await (db as any).cnWorkOrder.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
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
  let approval: any = null;
  if (row.approvalId) {
    const instance = await (db as any).cnApprovalInstance.findFirst({
      where: { id: row.approvalId, tenantId: ctx.tenantId },
      include: {
        history: { orderBy: { actionAt: "asc" } },
        workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      },
    });
    if (instance) {
      const userIds = Array.from(
        new Set<string>([
          instance.requestedById,
          ...instance.history.map((h: any) => h.actionById),
          ...(instance.workflow.steps
            .map((s: any) => s.approverUserId)
            .filter(Boolean) as string[]),
        ]),
      );
      const users = userIds.length
        ? await (db as any).cnUser.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
          })
        : [];
      const nameById = new Map<string, string>(
        users.map((u: any) => [u.id, u.fullName]),
      );
      approval = {
        id: instance.id,
        status: instance.status,
        currentStepOrder: instance.currentStepOrder,
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
  }

  return NextResponse.json({ ...enrichWO(row, row.project, row.contractor), approval });
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();
  const {
    id: _a,
    tenantId: _b,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    ...safe
  } = body ?? {};

  const existing = await (db as any).cnWorkOrder.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  // Build update payload from supported fields only. Unsupported
  // demo-only fields (workType, retentionPct, etc.) are silently dropped.
  const data: Record<string, unknown> = {};
  if (safe.title !== undefined) data.title = safe.title;
  if (safe.description !== undefined) data.description = safe.description;
  if (safe.contractorId !== undefined) data.contractorId = safe.contractorId;
  if (safe.workCategoryId !== undefined) data.workCategoryId = safe.workCategoryId;
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
  let boqItems: any[] | null = null;
  if (Array.isArray(safe.boqItems)) {
    boqItems = safe.boqItems;
    totalAmount = safe.boqItems.reduce(
      (sum: number, it: any) => sum + (Number(it.amount) || 0),
      0
    );
    data.totalAmount = String(totalAmount);
  }

  await db.$transaction(async (tx: any) => {
    await tx.cnWorkOrder.update({
      where: { id },
      data: tenantUpdate(ctx, data),
    });
    if (boqItems) {
      await tx.cnWorkOrderLine.deleteMany({ where: { woId: id } });
      if (boqItems.length > 0) {
        await tx.cnWorkOrderLine.createMany({
          data: boqItems.map((it: any) => ({
            woId: id,
            boqItemId: String(it.boqNo ?? it.boqItemId ?? ""),
            description: String(it.description ?? ""),
            quantity: String(Number(it.quantity) || 0),
            uomId: String(it.uomId ?? ""),
            negotiatedRate: String(Number(it.rate) || 0),
            amount: String(Number(it.amount) || 0),
          })),
        });
      }
    }
  });

  const next = await (db as any).cnWorkOrder.findFirst({
    where: { id },
    include: {
      lines: true,
      project: { select: { id: true, name: true, code: true } },
      contractor: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(enrichWO(next, next?.project, next?.contractor));
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
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Soft delete via status flip — preserves the row + lines for audit.
  const res = await (db as any).cnWorkOrder.updateMany({
    where: { id: params.id, tenantId: ctx.tenantId },
    data: { status: "inactive", updatedBy: ctx.userId },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
