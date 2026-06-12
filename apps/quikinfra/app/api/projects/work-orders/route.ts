import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenantCreate, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination } from "@/lib/http/pagination";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";

/**
 * Work Orders — flat list + create.
 *
 * Backed by `cn_work_orders` + `cn_work_order_lines` (Prisma).
 *
 * Schema-vs-UI gap: the UI carries a richer shape than the schema
 * (workType, retentionPct, securityDepositPct, tdsPct, progressPct,
 * type, plannedStart, plannedEnd). The schema only stores
 * startDate / endDate / totalAmount / title / etc. We persist what the
 * schema supports and echo the rest back on the response so the
 * existing API surface keeps the same keys, even though the optional
 * extras aren't durable.
 */

function enrichWO(row: any, project?: any, contractor?: any): any {
  const lines = (row.lines ?? []).map((l: any) => ({
    id: l.id,
    boqNo: l.boqItemId ?? "",
    boqItemId: l.boqItemId ?? "",
    description: l.description ?? "",
    uomId: l.uomId ?? "",
    uomCode: l.uomId ?? "",
    quantity: l.quantity?.toString?.() ?? "0",
    rate: l.negotiatedRate?.toString?.() ?? "0",
    amount: l.amount?.toString?.() ?? "0",
  }));
  return {
    id: row.id,
    woNumber: row.woNumber,
    orgId: row.orgId,
    projectId: row.projectId,
    projectName: project?.name ?? row.projectName ?? "",
    contractorId: row.contractorId,
    contractorName: contractor?.name ?? row.contractorName ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    type: row.type ?? "Work Order",
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const search = searchParams.get("search")?.toLowerCase() ?? "";

  const ctxOrResp = await requireProjectsFinanceAction("construction.wo", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const where: Record<string, unknown> = {
    orgId: ctx.orgId,
  };
  // Per-user project scoping — applied BEFORE the optional ?projectId
  // query filter so a user can never use the query string to see a project
  // they're not assigned to.
  if (Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0) {
    where.projectId = { in: ctx.projectIds };
  }
  if (status && status !== "all") where.status = status;
  if (projectId) where.projectId = projectId;

  const p = parsePagination(req);
  const rows = await (db as any).cnWorkOrder.findMany({
    where,
    include: {
      lines: true,
      project: { select: { id: true, name: true, code: true } },
      contractor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
  });

  let data = rows.map((r: any) => enrichWO(r, r.project, r.contractor));

  // Per-WO progress: quantity recorded against the WO through APPROVED DPRs
  // (CnDPRWorkItem.woId) over the WO's total scoped qty (sum of its line
  // quantities). Mirrors the BOQ progress that DPR approval posts, attributed
  // back to the work order so the Gantt bar fills as site work is reported.
  const woIds = rows.map((r: any) => r.id);
  const doneByWoId = new Map<string, number>();
  if (woIds.length) {
    const dprItems = await (db as any).cnDPRWorkItem.findMany({
      where: { woId: { in: woIds }, dpr: { orgId: ctx.orgId, status: "approved" } },
      select: { woId: true, todayQty: true },
    });
    for (const it of dprItems) {
      if (!it.woId) continue;
      doneByWoId.set(it.woId, (doneByWoId.get(it.woId) ?? 0) + Number(it.todayQty ?? 0));
    }
  }

  // Per-row Approve/Reject visibility — driven by the workflow's current
  // step, not the caller's role. Batch-load pending instances + their
  // workflow.steps in one round-trip and decorate each row with
  // `canActOnCurrentStep`.
  const approvalIds = data
    .map((r: any) => r.approvalId)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);
  const instances =
    approvalIds.length === 0
      ? []
      : await (db as any).cnApprovalInstance.findMany({
          where: { id: { in: approvalIds }, orgId: ctx.orgId },
          include: {
            workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
          },
        });
  const instanceById = new Map<string, any>(
    instances.map((i: any) => [i.id, i]),
  );
  const actor = {
    userId: ctx.userId,
    roleKey: ctx.roleKey,
    projectIds: ctx.projectIds,
  };
  data = data.map((row: any) => {
    const instance = row.approvalId ? instanceById.get(row.approvalId) : null;
    const scopeQty = (row.lines ?? []).reduce(
      (sum: number, l: any) => sum + Number(l.quantity ?? 0),
      0,
    );
    const doneQty = doneByWoId.get(row.id) ?? 0;
    const progressPct =
      scopeQty > 0 ? Math.min(100, Math.round((doneQty / scopeQty) * 100)) : 0;
    return {
      ...row,
      progressPct,
      canActOnCurrentStep: instance
        ? canActOnCurrentStep(actor, instance, row.projectId ?? null)
        : false,
    };
  });

  if (search) {
    data = data.filter((r: any) =>
      [r.woNumber, r.title, r.projectName, r.contractorName]
        .some((v) => typeof v === "string" && v.toLowerCase().includes(search))
    );
  }

  if (p.paginated) {
    return NextResponse.json({
      data,
      total: data.length,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: data.length === p.pageSize,
    });
  }
  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.wo", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "pm.work_order", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for pm.work_order`, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    );
  }

  // Resolve project + contractor via Prisma. contractorId is NOT NULL on
  // the WO schema, so we require one before we can persist.
  const project = await (db as any).cnProject.findFirst({
    where: { id: body.projectId, orgId: ctx.orgId },
    select: { id: true, name: true, code: true },
  });
  if (!project) {
    return NextResponse.json(
      { error: `Project ${body.projectId} not found` },
      { status: 404 }
    );
  }

  let contractor: any = null;
  if (body.contractorId) {
    contractor = await (db as any).cnContractor.findFirst({
      where: { id: body.contractorId, orgId: ctx.orgId },
      select: { id: true, name: true },
    });
  }
  if (!contractor) {
    return NextResponse.json(
      { error: "contractorId is required and must reference an existing contractor" },
      { status: 400 }
    );
  }

  // Auto WO number — pattern: WO-<projectSlug>-<next>
  const existingCount = await (db as any).cnWorkOrder.count({
    where: { orgId: ctx.orgId, projectId: project.id },
  });
  const slug = String(project.code ?? project.name ?? "NEW")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6) || "NEW";
  const next = (existingCount + 460).toString().padStart(3, "0");
  const woNumber = body.woNumber ?? `WO-${slug}-${next}`;

  const boqItems: any[] = Array.isArray(body.boqItems) ? body.boqItems : [];
  const totalAmount = boqItems.reduce(
    (sum, it) => sum + (Number(it.amount) || 0),
    0
  );

  const startDate = body.plannedStart
    ? new Date(body.plannedStart)
    : new Date();
  const endDate = body.plannedEnd ? new Date(body.plannedEnd) : new Date();

  try {
    const created = await (db as any).cnWorkOrder.create({
      data: tenantCreate(ctx, {
        woNumber,
        projectId: project.id,
        contractorId: contractor.id,
        title: body.title ?? `Work Order ${woNumber}`,
        description: body.description ?? null,
        workType: body.workType ?? null,
        startDate,
        endDate,
        totalAmount: String(totalAmount),
        status: body.status ?? "draft",
        lines: {
          create: boqItems.map((it: any) => ({
            boqItemId: String(it.boqNo ?? it.boqItemId ?? ""),
            description: String(it.description ?? ""),
            quantity: String(Number(it.quantity) || 0),
            uomId: String(it.uomCode ?? it.uomId ?? ""),
            negotiatedRate: String(Number(it.rate) || 0),
            amount: String(Number(it.amount) || 0),
          })),
        },
      }),
      include: {
        lines: true,
        project: { select: { id: true, name: true, code: true } },
        contractor: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(enrichWO(created, created.project, created.contractor), { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "A work order with this number already exists" },
        { status: 409 }
      );
    }
    console.error("[work-order.create] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
