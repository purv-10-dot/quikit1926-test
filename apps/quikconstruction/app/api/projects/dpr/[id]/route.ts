import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext, tenantUpdate } from "@/lib/auth/context";

/**
 * DPR — per-row endpoints.
 *
 * GET    /api/projects/dpr/:id  → fetch one DPR
 * PUT    /api/projects/dpr/:id  → update (edit flow)
 * DELETE /api/projects/dpr/:id  → soft delete (status = "inactive")
 */

async function enrichDPR(row: any, project?: any): Promise<any> {
  // Resolve boqItemId → boqNo so the detail UI can show "1.1.2a" instead
  // of the raw cuid. We only persist boqItemId on the DPR work item, so
  // the join has to happen at read time.
  const boqItemIds = Array.from(
    new Set(
      ((row.workItems ?? []) as any[])
        .map((w) => w.boqItemId)
        .filter((v) => typeof v === "string" && v.length > 0),
    ),
  );
  let boqNoById = new Map<string, string>();
  if (boqItemIds.length) {
    const boqRows = await (db as any).cnBOQItemV2.findMany({
      where: { id: { in: boqItemIds }, tenantId: row.tenantId },
      select: { id: true, boqNo: true },
    });
    boqNoById = new Map<string, string>(
      boqRows.map((r: any) => [r.id, r.boqNo]),
    );
  }

  const workItems = (row.workItems ?? []).map((w: any) => ({
    id: w.id,
    boqItemId: w.boqItemId ?? "",
    boqNo: boqNoById.get(w.boqItemId) ?? "",
    woId: w.woId ?? null,
    description: w.description ?? "",
    todayQty: w.todayQty?.toString?.() ?? "0",
    cumulativeQty: w.cumulativeQty?.toString?.() ?? "0",
    uomId: w.uomId ?? "",
    remarks: w.remarks ?? "",
  }));
  const labour = (row.labourEntries ?? []).map((l: any) => ({
    id: l.id,
    category: l.category ?? "",
    skillType: l.skillType ?? "",
    count: l.count ?? 0,
    hoursWorked: l.hoursWorked?.toString?.() ?? "0",
    contractorId: l.contractorId ?? null,
  }));
  const machinery = (row.machineryEntries ?? []).map((m: any) => ({
    id: m.id,
    machineryId: m.machineryId ?? "",
    hoursWorked: m.hoursWorked?.toString?.() ?? "0",
    fuelConsumed: m.fuelConsumed?.toString?.() ?? null,
    operatorName: m.operatorName ?? null,
    remarks: m.remarks ?? null,
  }));
  const materials = (row.materialEntries ?? []).map((m: any) => ({
    id: m.id,
    itemId: m.itemId ?? "",
    consumedQty: m.consumedQty?.toString?.() ?? "0",
    uomId: m.uomId ?? "",
    remarks: m.remarks ?? null,
  }));

  return {
    id: row.id,
    dprNumber: row.dprNumber,
    tenantId: row.tenantId,
    orgId: row.orgId,
    projectId: row.projectId,
    projectName: project?.name ?? "",
    reportDate: row.reportDate?.toISOString?.().slice(0, 10) ?? "",
    weatherCondition: row.weatherCondition ?? "",
    siteRemarks: row.remarks ?? "",
    workHalted: false,
    workItems,
    materials,
    manpower: labour,
    staff: [],
    machinery,
    workItemCount: workItems.length,
    materialCount: materials.length,
    manpowerCount: labour.length,
    staffCount: 0,
    machineryCount: machinery.length,
    status: row.status,
    approvalId: row.approvalId ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await getTenantContext();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const row = await (db as any).cnDailyProgressReport.findFirst({
    where: { id: ctx.params.id, tenantId: auth.tenantId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      workItems: true,
      labourEntries: true,
      machineryEntries: true,
      materialEntries: true,
    },
  });
  if (!row || row.status === "inactive") {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }

  // Join the approval instance (if any) so the detail page can render
  // the timeline without a second fetch. Mirrors the WO detail route.
  let approval: any = null;
  if (row.approvalId) {
    const instance = await (db as any).cnApprovalInstance.findFirst({
      where: { id: row.approvalId, tenantId: auth.tenantId },
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

  return NextResponse.json({ ...(await enrichDPR(row, row.project)), approval });
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const auth = await getTenantContext();
    if (!auth)
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const existing = await (db as any).cnDailyProgressReport.findFirst({
      where: { id: ctx.params.id, tenantId: auth.tenantId },
    });
    if (!existing || existing.status === "inactive") {
      return NextResponse.json({ error: "DPR not found" }, { status: 404 });
    }

    const body = await req.json();

    let projectId = existing.projectId;
    if (body.projectId && body.projectId !== existing.projectId) {
      const project = await (db as any).cnProject.findFirst({
        where: { id: body.projectId, tenantId: auth.tenantId },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json(
          { error: `Project ${body.projectId} not found` },
          { status: 404 }
        );
      }
      projectId = body.projectId;
    }

    const data: Record<string, unknown> = {};
    data.projectId = projectId;
    if (body.reportDate) data.reportDate = new Date(body.reportDate);
    if (body.weatherCondition !== undefined || body.weather !== undefined) {
      data.weatherCondition = body.weatherCondition ?? body.weather ?? null;
    }
    if (body.siteRemarks !== undefined) data.remarks = body.siteRemarks;
    if (body.status === "submitted" || body.status === "draft") {
      data.status = body.status;
    }

    const hasWorkItems = Array.isArray(body.workItems ?? body.items);
    const hasMaterials = Array.isArray(body.materials);
    const hasManpower = Array.isArray(body.manpower);
    const hasMachinery = Array.isArray(body.machinery);

    await db.$transaction(async (tx: any) => {
      await tx.cnDailyProgressReport.update({
        where: { id: ctx.params.id },
        data: tenantUpdate(auth, data),
      });

      if (hasWorkItems) {
        await tx.cnDPRWorkItem.deleteMany({ where: { dprId: ctx.params.id } });
        const items = body.workItems ?? body.items;
        if (items.length > 0) {
          await tx.cnDPRWorkItem.createMany({
            data: items.map((w: any) => ({
              dprId: ctx.params.id,
              boqItemId: String(w.boqItemId ?? w.boqNo ?? ""),
              woId: w.woId ?? null,
              description: String(w.description ?? ""),
              todayQty: String(Number(w.todayQty ?? w.qty ?? 0)),
              cumulativeQty: String(Number(w.cumulativeQty ?? w.todayQty ?? w.qty ?? 0)),
              uomId: String(w.uomId ?? ""),
              remarks: w.remarks ?? null,
            })),
          });
        }
      }

      if (hasMaterials) {
        await tx.cnDPRMaterialEntry.deleteMany({ where: { dprId: ctx.params.id } });
        if (body.materials.length > 0) {
          await tx.cnDPRMaterialEntry.createMany({
            data: body.materials.map((m: any) => ({
              dprId: ctx.params.id,
              itemId: String(m.itemId ?? ""),
              consumedQty: String(Number(m.consumedQty ?? m.quantity ?? 0)),
              uomId: String(m.uomId ?? ""),
              remarks: m.remarks ?? null,
            })),
          });
        }
      }

      if (hasManpower) {
        await tx.cnDPRLabourEntry.deleteMany({ where: { dprId: ctx.params.id } });
        if (body.manpower.length > 0) {
          await tx.cnDPRLabourEntry.createMany({
            data: body.manpower.map((l: any) => ({
              dprId: ctx.params.id,
              category: String(l.category ?? l.role ?? ""),
              skillType: String(l.skillType ?? l.skill ?? ""),
              count: Number(l.count ?? l.headcount ?? 0),
              hoursWorked: String(Number(l.hoursWorked ?? l.hours ?? 0)),
              contractorId: l.contractorId ?? null,
            })),
          });
        }
      }

      if (hasMachinery) {
        await tx.cnDPRMachineryEntry.deleteMany({ where: { dprId: ctx.params.id } });
        if (body.machinery.length > 0) {
          await tx.cnDPRMachineryEntry.createMany({
            data: body.machinery.map((m: any) => ({
              dprId: ctx.params.id,
              machineryId: String(m.machineryId ?? m.id ?? ""),
              hoursWorked: String(Number(m.hoursWorked ?? m.hours ?? 0)),
              fuelConsumed:
                m.fuelConsumed !== undefined && m.fuelConsumed !== null
                  ? String(Number(m.fuelConsumed))
                  : null,
              operatorName: m.operatorName ?? null,
              remarks: m.remarks ?? null,
            })),
          });
        }
      }
    });

    const updated = await (db as any).cnDailyProgressReport.findFirst({
      where: { id: ctx.params.id },
      include: {
        project: { select: { id: true, name: true, code: true } },
        workItems: true,
        labourEntries: true,
        machineryEntries: true,
        materialEntries: true,
      },
    });
    return NextResponse.json(await enrichDPR(updated, updated?.project));
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await getTenantContext();
  if (!auth)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const res = await (db as any).cnDailyProgressReport.updateMany({
    where: { id: ctx.params.id, tenantId: auth.tenantId },
    data: { status: "inactive", updatedBy: auth.userId },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }
  const refreshed = await (db as any).cnDailyProgressReport.findFirst({
    where: { id: ctx.params.id },
    include: {
      project: { select: { id: true, name: true, code: true } },
      workItems: true,
      labourEntries: true,
      machineryEntries: true,
      materialEntries: true,
    },
  });
  return NextResponse.json(await enrichDPR(refreshed, refreshed?.project));
}
