import type { Prisma } from "@prisma/client";
import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
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

function enrichWO(
  row: Prisma.CnWorkOrderGetPayload<{ include: { lines: true } }>,
  project?: { name?: string | null } | null,
  contractor?: { name?: string | null } | null,
) {
  const lines = (row.lines ?? []).map((l) => ({
    id: l.id,
    lineType: l.lineType ?? "boq",
    boqNo: l.boqItemId ?? "",
    boqItemId: l.boqItemId ?? "",
    description: l.description ?? "",
    uomId: l.uomId ?? "",
    uomCode: l.uomId ?? "",
    quantity: l.quantity?.toString?.() ?? "0",
    rate: l.negotiatedRate?.toString?.() ?? "0",
    amount: l.amount?.toString?.() ?? "0",
    lineDate: l.lineDate?.toISOString?.().slice(0, 10) ?? "",
    activityName: l.activityName ?? "",
    workCategoryId: l.workCategoryId ?? "",
    labourCategoryId: (l as { labourCategoryId?: string | null }).labourCategoryId ?? "",
    labourCount: (l as { labourCount?: { toString?: () => string } | null }).labourCount?.toString?.() ?? "",
  }));
  return {
    id: row.id,
    woNumber: row.woNumber,
    orgId: row.orgId,
    projectId: row.projectId,
    projectName:
      project?.name ??
      (row as { projectName?: string | null }).projectName ??
      "",
    contractorId: row.contractorId,
    contractorName:
      contractor?.name ??
      (row as { contractorName?: string | null }).contractorName ??
      "",
    title: row.title ?? "",
    description: row.description ?? "",
    type: (row as { type?: string | null }).type ?? "Work Order",
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
  const contractorId = searchParams.get("contractorId") ?? "";
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
  // Soft-deleted rows are hidden from every list view.
  where.status = { not: "inactive" };
  if (status && status !== "all") where.status = status;
  if (projectId) where.projectId = projectId;
  if (contractorId) where.contractorId = contractorId;
  // Search pushed into the DB so it stays correct under pagination (the old
  // in-memory filter ran AFTER take/skip, so it only searched one page).
  if (search) {
    where.OR = [
      { woNumber: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { project: { is: { name: { contains: search, mode: "insensitive" } } } },
      { contractor: { is: { name: { contains: search, mode: "insensitive" } } } },
    ];
  }

  // KPI tiles (Total / Active / Value / Avg progress) over the filtered set,
  // computed server-side so they stay correct regardless of pagination.
  if (searchParams.get("stats") === "1") {
    const statsWhere = { ...where, status: { not: "inactive" } };
    const [grouped, agg, woForProgress] = await Promise.all([
      db.cnWorkOrder.groupBy({
        by: ["status"],
        where: statsWhere,
        _count: { _all: true },
      }),
      db.cnWorkOrder.aggregate({
        where: statsWhere,
        _sum: { totalAmount: true },
      }),
      db.cnWorkOrder.findMany({
        where: statsWhere,
        select: { id: true, lines: { select: { quantity: true } } },
      }),
    ]);
    let total = 0;
    let active = 0;
    for (const g of grouped) {
      total += g._count._all;
      if (g.status === "approved" || g.status === "in_progress") {
        active += g._count._all;
      }
    }
    const totalValue = Number(agg._sum.totalAmount ?? 0);
    // Avg progress needs DPR-derived done-qty per WO (same as the list rows),
    // aggregated across every matching WO. WO counts are bounded per org.
    const statWoIds = woForProgress.map((w) => w.id);
    const doneByWo = new Map<string, number>();
    if (statWoIds.length) {
      const items = await db.cnDPRWorkItem.findMany({
        where: {
          woId: { in: statWoIds },
          dpr: { orgId: ctx.orgId, status: "approved" },
        },
        select: { woId: true, todayQty: true },
      });
      for (const it of items) {
        if (!it.woId) continue;
        doneByWo.set(it.woId, (doneByWo.get(it.woId) ?? 0) + Number(it.todayQty ?? 0));
      }
    }
    let progressSum = 0;
    for (const w of woForProgress) {
      const scope = (w.lines ?? []).reduce(
        (s, l) => s + Number(l.quantity ?? 0),
        0,
      );
      const done = doneByWo.get(w.id) ?? 0;
      progressSum += scope > 0 ? Math.min(100, Math.round((done / scope) * 100)) : 0;
    }
    const avgProgress = woForProgress.length
      ? Math.round(progressSum / woForProgress.length)
      : 0;
    return NextResponse.json({ stats: { total, active, totalValue, avgProgress } });
  }

  const p = parsePagination(req);
  const rows = await db.cnWorkOrder.findMany({
    where,
    include: {
      lines: true,
      project: { select: { id: true, name: true, code: true } },
      contractor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
  });

  let data = rows.map((r) => enrichWO(r, r.project, r.contractor));

  // Per-WO progress: quantity recorded against the WO through APPROVED DPRs
  // (CnDPRWorkItem.woId) over the WO's total scoped qty (sum of its line
  // quantities). Mirrors the BOQ progress that DPR approval posts, attributed
  // back to the work order so the Gantt bar fills as site work is reported.
  const woIds = rows.map((r) => r.id);
  const doneByWoId = new Map<string, number>();
  if (woIds.length) {
    const dprItems = await db.cnDPRWorkItem.findMany({
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
    .map((r) => r.approvalId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const instances =
    approvalIds.length === 0
      ? []
      : await db.cnApprovalInstance.findMany({
          where: { id: { in: approvalIds }, orgId: ctx.orgId },
          include: {
            workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
          },
        });
  const instanceById = new Map(
    instances.map((i): [string, (typeof instances)[number]] => [i.id, i]),
  );
  const actor = {
    userId: ctx.userId,
    roleKey: ctx.roleKey,
    projectIds: ctx.projectIds,
  };
  data = data.map((row) => {
    const instance = row.approvalId ? instanceById.get(row.approvalId) : null;
    const scopeQty = (row.lines ?? []).reduce(
      (sum, l) => sum + Number(l.quantity ?? 0),
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

  if (p.paginated) {
    const total = await db.cnWorkOrder.count({ where });
    return NextResponse.json({
      data,
      total,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: p.skip + data.length < total,
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

  let body: {
    projectId?: string;
    contractorId?: string;
    woNumber?: string;
    title?: string;
    description?: string | null;
    workType?: string | null;
    plannedStart?: string;
    plannedEnd?: string;
    status?: string;
    boqItems?: Array<{
      boqNo?: string | null;
      boqItemId?: string | null;
      scopeType?: string | null;
      scopeId?: string | null;
      description?: string | null;
      quantity?: number | string | null;
      uomCode?: string | null;
      uomId?: string | null;
      rate?: number | string | null;
      amount?: number | string | null;
      lineType?: string | null;
      lineDate?: string | null;
      activityName?: string | null;
      workCategoryId?: string | null;
      labourCategoryId?: string | null;
      labourCount?: number | string | null;
    }>;
  };
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
  const project = await db.cnProject.findFirst({
    where: { id: body.projectId, orgId: ctx.orgId },
    select: { id: true, name: true, code: true },
  });
  if (!project) {
    return NextResponse.json(
      { error: `Project ${body.projectId} not found` },
      { status: 404 }
    );
  }

  let contractor: { id: string; name: string } | null = null;
  if (body.contractorId) {
    contractor = await db.cnContractor.findFirst({
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
  const existingCount = await db.cnWorkOrder.count({
    where: { orgId: ctx.orgId, projectId: project.id },
  });
  const slug = String(project.code ?? project.name ?? "NEW")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6) || "NEW";
  const next = (existingCount + 460).toString().padStart(3, "0");
  const woNumber = body.woNumber ?? `WO-${slug}-${next}`;

  const boqItems = Array.isArray(body.boqItems) ? body.boqItems : [];
  const totalAmount = boqItems.reduce(
    (sum, it) => sum + (Number(it.amount) || 0),
    0
  );

  const startDate = body.plannedStart
    ? new Date(body.plannedStart)
    : new Date();
  const endDate = body.plannedEnd ? new Date(body.plannedEnd) : new Date();

  try {
    const created = await db.cnWorkOrder.create({
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
          create: boqItems.map((it) => ({
            lineType: (it.lineType as string) ?? "boq",
            boqItemId:
              it.scopeType === "ACTIVITY"
                ? null
                : String(it.boqNo ?? it.boqItemId ?? ""),
            scopeType: it.scopeType ?? null,
            scopeId: it.scopeId ?? null,
            description: String(it.description ?? ""),
            quantity: String(Number(it.quantity) || 0),
            uomId: String(it.uomCode ?? it.uomId ?? ""),
            negotiatedRate: String(Number(it.rate) || 0),
            amount: String(Number(it.amount) || 0),
            lineDate: it.lineDate ? new Date(it.lineDate) : null,
            activityName: it.activityName ?? null,
            workCategoryId: it.workCategoryId ?? null,
            labourCategoryId: it.labourCategoryId ?? null,
            labourCount: it.labourCount != null ? String(it.labourCount) : null,
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
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A work order with this number already exists" },
        { status: 409 }
      );
    }
    console.error("[work-order.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err) ?? "Internal error" },
      { status: 500 }
    );
  }
}
