import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { BOQError } from "@/lib/boq";
import { getTenantContext, tenantCreate } from "@/lib/auth/context";
import { parsePagination } from "@/lib/http/pagination";

/**
 * DPR (Daily Progress Report) — list + create.
 *
 * Storage: `daily_progress_reports` (Prisma) + nested children
 * (`dpr_work_items`, `dpr_labour_entries`,
 * `dpr_machinery_entries`, `dpr_material_entries`).
 *
 * Schema-vs-UI gap: the UI carries fields that don't have columns in the
 * current schema (workHalted, manpower-vs-labour split, staff). We persist
 * what the schema supports and echo the rest back from the request when
 * possible so the existing API surface stays compatible.
 */

// `boqNoById` is supplied by the caller after a single batched BOQ lookup
// — see GET below — so list endpoints don't fan out into N+1 queries.
function enrichDPR(
  row: any,
  project?: any,
  boqNoById?: Map<string, string>,
): any {
  const workItems = (row.workItems ?? []).map((w: any) => ({
    id: w.id,
    boqItemId: w.boqItemId ?? "",
    boqNo: boqNoById?.get(w.boqItemId) ?? "",
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
    projectName: project?.name ?? row.projectName ?? "",
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

export async function GET(req: NextRequest) {
  try {  
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "";
    const projectId = searchParams.get("projectId") ?? "";
    const search = searchParams.get("search")?.toLowerCase() ?? "";
  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
  
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
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
  
    const p = parsePagination(req);
    const rows = await (db as any).cnDailyProgressReport.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true } },
        workItems: true,
        labourEntries: true,
        machineryEntries: true,
        materialEntries: true,
      },
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
    });
  
    // Single batched lookup of every boqItemId across every DPR's work
    // items → boqNo. Avoids N+1 queries and lets the list show "1.1.2a"
    // instead of the raw cuid in any drill-down.
    const allBoqItemIds = Array.from(
      new Set(
        rows.flatMap((r: any) =>
          (r.workItems ?? [])
            .map((w: any) => w.boqItemId)
            .filter((v: any) => typeof v === "string" && v.length > 0),
        ),
      ),
    ) as string[];
    let boqNoById = new Map<string, string>();
    if (allBoqItemIds.length) {
      const boqRows = await (db as any).cnBOQItemV2.findMany({
        where: { id: { in: allBoqItemIds }, tenantId: ctx.tenantId },
        select: { id: true, boqNo: true },
      });
      boqNoById = new Map<string, string>(
        boqRows.map((r: any) => [r.id, r.boqNo]),
      );
    }
  
    let data = rows.map((r: any) => enrichDPR(r, r.project, boqNoById));
  
    if (search) {
      data = data.filter((d: any) =>
        [d.dprNumber, d.projectName, d.siteRemarks]
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

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[projects/dpr.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantContext();
    if (!ctx)
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const body = await req.json();

    if (!body.projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const project = await (db as any).cnProject.findFirst({
      where: { id: body.projectId, tenantId: ctx.tenantId },
      select: { id: true, name: true, code: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: `Project ${body.projectId} not found` },
        { status: 404 }
      );
    }

    const reportDateStr =
      body.reportDate ?? new Date().toISOString().split("T")[0];
    const compactDate = String(reportDateStr).replace(/-/g, "");
    const slug =
      String(project.code ?? project.name ?? "SITE")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
        .slice(0, 6) || "SITE";

    const sameDayCount = await (db as any).cnDailyProgressReport.count({
      where: {
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        projectId: body.projectId,
        reportDate: new Date(reportDateStr),
      },
    });
    const seq = String(sameDayCount + 1).padStart(3, "0");
    const dprNumber = body.dprNumber ?? `DPR-${slug}-${compactDate}-${seq}`;

    const requestedStatus = body.status === "submitted" ? "submitted" : "draft";

    const workItems: any[] = Array.isArray(body.workItems ?? body.items)
      ? body.workItems ?? body.items
      : [];
    const materials: any[] = Array.isArray(body.materials) ? body.materials : [];
    const manpower: any[] = Array.isArray(body.manpower) ? body.manpower : [];
    const machinery: any[] = Array.isArray(body.machinery) ? body.machinery : [];

    const created = await (db as any).cnDailyProgressReport.create({
      data: tenantCreate(ctx, {
        dprNumber,
        projectId: project.id,
        reportDate: new Date(reportDateStr),
        submittedById: ctx.userId,
        weatherCondition: body.weatherCondition ?? body.weather ?? null,
        remarks: body.siteRemarks ?? null,
        status: requestedStatus,
        workItems: {
          create: workItems.map((w: any) => ({
            boqItemId: String(w.boqItemId ?? w.boqNo ?? ""),
            woId: w.woId ?? null,
            description: String(w.description ?? ""),
            todayQty: String(Number(w.todayQty ?? w.qty ?? 0)),
            cumulativeQty: String(Number(w.cumulativeQty ?? w.todayQty ?? w.qty ?? 0)),
            uomId: String(w.uomId ?? ""),
            remarks: w.remarks ?? null,
          })),
        },
        labourEntries: {
          create: manpower.map((l: any) => ({
            category: String(l.category ?? l.role ?? ""),
            skillType: String(l.skillType ?? l.skill ?? ""),
            count: Number(l.count ?? l.headcount ?? 0),
            hoursWorked: String(Number(l.hoursWorked ?? l.hours ?? 0)),
            contractorId: l.contractorId ?? null,
          })),
        },
        machineryEntries: {
          create: machinery.map((m: any) => ({
            machineryId: String(m.machineryId ?? m.id ?? ""),
            hoursWorked: String(Number(m.hoursWorked ?? m.hours ?? 0)),
            fuelConsumed: m.fuelConsumed !== undefined && m.fuelConsumed !== null
              ? String(Number(m.fuelConsumed))
              : null,
            operatorName: m.operatorName ?? null,
            remarks: m.remarks ?? null,
          })),
        },
        materialEntries: {
          create: materials.map((m: any) => ({
            itemId: String(m.itemId ?? ""),
            consumedQty: String(Number(m.consumedQty ?? m.quantity ?? 0)),
            uomId: String(m.uomId ?? ""),
            remarks: m.remarks ?? null,
          })),
        },
      }),
      include: {
        project: { select: { id: true, name: true, code: true } },
        workItems: true,
        labourEntries: true,
        machineryEntries: true,
        materialEntries: true,
      },
    });

    // Resolve boqItemId → boqNo on the freshly-created rows so the
    // client gets the human-readable BOQ ref back without a refetch.
    const createdBoqIds = Array.from(
      new Set(
        ((created.workItems ?? []) as any[])
          .map((w) => w.boqItemId)
          .filter((v) => typeof v === "string" && v.length > 0),
      ),
    ) as string[];
    let createdBoqNoById = new Map<string, string>();
    if (createdBoqIds.length) {
      const boqRows = await (db as any).cnBOQItemV2.findMany({
        where: { id: { in: createdBoqIds }, tenantId: ctx.tenantId },
        select: { id: true, boqNo: true },
      });
      createdBoqNoById = new Map<string, string>(
        boqRows.map((r: any) => [r.id, r.boqNo]),
      );
    }
    return NextResponse.json(
      enrichDPR(created, created.project, createdBoqNoById),
      { status: 201 },
    );
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: err.httpStatus }
      );
    }
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A DPR with this number already exists" },
        { status: 409 }
      );
    }
    console.error("[dpr.create] failed:", err);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
