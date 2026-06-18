import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { BOQError } from "@/lib/boq";
import { tenantCreate, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination } from "@/lib/http/pagination";
import { parseStoredWeatherDetail } from "@/lib/weather/dpr-weather";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";
import { persistDprImages } from "@/lib/dpr/dpr-images";

/**
 * DPR (Daily Progress Report) — list + create.
 *
 * Storage: `cn_daily_progress_reports` (Prisma) + nested children
 * (`cn_dpr_work_items`, `cn_dpr_labour_entries`,
 * `cn_dpr_machinery_entries`, `cn_dpr_material_entries`).
 *
 * Schema-vs-UI gap: the UI carries fields that don't have columns in the
 * current schema (workHalted, manpower-vs-labour split, staff). We persist
 * what the schema supports and echo the rest back from the request when
 * possible so the existing API surface stays compatible.
 */

type Numericish = Prisma.Decimal | number | string | null | undefined;

/** Coerce a request value to a Decimal-safe string, or null when blank/absent.
 *  Used by the DPR manpower trade-grid columns (messan, helpers, trades). */
function toDecimalOrNull(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

interface DprWorkItemRow {
  id: string;
  boqItemId?: string | null;
  woId?: string | null;
  description?: string | null;
  todayQty?: Numericish;
  cumulativeQty?: Numericish;
  uomId?: string | null;
  remarks?: string | null;
}
interface DprLabourRow {
  id: string;
  category?: string | null;
  skillType?: string | null;
  count?: number | null;
  hoursWorked?: Numericish;
  contractorId?: string | null;
  workingArea?: string | null;
  messan?: Numericish;
  maleHelper?: Numericish;
  femaleHelper?: Numericish;
  carpenter?: Numericish;
  fitter?: Numericish;
  painter?: Numericish;
  plumber?: Numericish;
  electrician?: Numericish;
  operator?: Numericish;
}
interface DprMachineryRow {
  id: string;
  machineryId?: string | null;
  hoursWorked?: Numericish;
  fuelConsumed?: Numericish;
  operatorName?: string | null;
  remarks?: string | null;
}
interface DprMaterialRow {
  id: string;
  itemId?: string | null;
  consumedQty?: Numericish;
  uomId?: string | null;
  remarks?: string | null;
}
interface DprProject {
  id?: string;
  name?: string | null;
  code?: string | null;
}
interface DprRow {
  id: string;
  dprNumber?: string;
  orgId?: string;
  projectId?: string;
  projectName?: string | null;
  reportDate?: Date | null;
  weatherCondition?: string | null;
  weatherDetail?: unknown;
  remarks?: string | null;
  status?: string;
  approvalId?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  createdBy?: string;
  updatedBy?: string;
  workItems?: DprWorkItemRow[];
  labourEntries?: DprLabourRow[];
  machineryEntries?: DprMachineryRow[];
  materialEntries?: DprMaterialRow[];
}

// Body-input element shapes (request payload from the DPR form).
interface DprBodyWorkItem {
  boqItemId?: string;
  boqNo?: string;
  woId?: string | null;
  description?: string;
  todayQty?: number | string;
  qty?: number | string;
  cumulativeQty?: number | string;
  uomId?: string;
  remarks?: string | null;
  images?: unknown;
  imageKeys?: unknown;
}
interface DprBodyManpower {
  category?: string;
  role?: string;
  skillType?: string;
  skill?: string;
  count?: number | string;
  headcount?: number | string;
  hoursWorked?: number | string;
  hours?: number | string;
  contractorId?: string | null;
  workingArea?: string | null;
  messan?: number | string | null;
  maleHelper?: number | string | null;
  femaleHelper?: number | string | null;
  carpenter?: number | string | null;
  fitter?: number | string | null;
  painter?: number | string | null;
  plumber?: number | string | null;
  electrician?: number | string | null;
  operator?: number | string | null;
}
interface DprBodyMachinery {
  description?: string;
  condition?: string | null;
  requiredQty?: number | string;
  actualQty?: number | string;
  remarks?: string | null;
}
interface DprBodyMaterial {
  itemId?: string;
  consumedQty?: number | string;
  quantity?: number | string;
  uomId?: string;
  remarks?: string | null;
}
interface DprBodyStaff {
  name?: string;
  designation?: string | null;
  present?: boolean;
  reason?: string | null;
}
interface DprCreateBody {
  projectId?: string;
  dprNumber?: string;
  reportDate?: string;
  status?: string;
  weatherCondition?: string;
  weather?: string;
  weatherDetail?: unknown;
  siteRemarks?: string;
  consumptionLocationId?: string;
  workItems?: DprBodyWorkItem[];
  items?: DprBodyWorkItem[];
  materials?: DprBodyMaterial[];
  manpower?: DprBodyManpower[];
  machinery?: DprBodyMachinery[];
  staff?: DprBodyStaff[];
}

// `boqNoById` is supplied by the caller after a single batched BOQ lookup
// — see GET below — so list endpoints don't fan out into N+1 queries.
function enrichDPR(
  row: DprRow,
  project?: DprProject,
  boqNoById?: Map<string, string>,
) {
  const workItems = (row.workItems ?? []).map((w: DprWorkItemRow) => ({
    id: w.id,
    boqItemId: w.boqItemId ?? "",
    boqNo: boqNoById?.get(w.boqItemId ?? "") ?? "",
    woId: w.woId ?? null,
    description: w.description ?? "",
    todayQty: w.todayQty?.toString?.() ?? "0",
    cumulativeQty: w.cumulativeQty?.toString?.() ?? "0",
    uomId: w.uomId ?? "",
    remarks: w.remarks ?? "",
  }));
  const labour = (row.labourEntries ?? []).map((l: DprLabourRow) => ({
    id: l.id,
    category: l.category ?? "",
    skillType: l.skillType ?? "",
    count: l.count ?? 0,
    hoursWorked: l.hoursWorked?.toString?.() ?? "0",
    contractorId: l.contractorId ?? null,
    workingArea: l.workingArea ?? "",
    messan: l.messan?.toString?.() ?? "0",
    maleHelper: l.maleHelper?.toString?.() ?? "0",
    femaleHelper: l.femaleHelper?.toString?.() ?? "0",
    carpenter: l.carpenter?.toString?.() ?? "0",
    fitter: l.fitter?.toString?.() ?? "0",
    painter: l.painter?.toString?.() ?? "0",
    plumber: l.plumber?.toString?.() ?? "0",
    electrician: l.electrician?.toString?.() ?? "0",
    operator: l.operator?.toString?.() ?? "0",
  }));
  const machinery = (row.machineryEntries ?? []).map((m: DprMachineryRow) => ({
    id: m.id,
    machineryId: m.machineryId ?? "",
    hoursWorked: m.hoursWorked?.toString?.() ?? "0",
    fuelConsumed: m.fuelConsumed?.toString?.() ?? null,
    operatorName: m.operatorName ?? null,
    remarks: m.remarks ?? null,
  }));
  const materials = (row.materialEntries ?? []).map((m: DprMaterialRow) => ({
    id: m.id,
    itemId: m.itemId ?? "",
    consumedQty: m.consumedQty?.toString?.() ?? "0",
    uomId: m.uomId ?? "",
    remarks: m.remarks ?? null,
  }));

  return {
    id: row.id,
    dprNumber: row.dprNumber,
    orgId: row.orgId,
    projectId: row.projectId,
    projectName: project?.name ?? row.projectName ?? "",
    reportDate: row.reportDate?.toISOString?.().slice(0, 10) ?? "",
    weatherCondition: row.weatherCondition ?? "",
    weatherDetail: parseStoredWeatherDetail(row.weatherDetail) ?? null,
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
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const search = searchParams.get("search")?.toLowerCase() ?? "";

  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "view");
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

  const p = parsePagination(req);
  const rows = await db.cnDailyProgressReport.findMany({
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
      rows.flatMap((r) =>
        (r.workItems ?? [])
          .map((w) => w.boqItemId)
          .filter((v) => typeof v === "string" && v.length > 0),
      ),
    ),
  ) as string[];
  let boqNoById = new Map<string, string>();
  if (allBoqItemIds.length) {
    const boqRows = await db.cnBOQItemV2.findMany({
      where: { id: { in: allBoqItemIds }, orgId: ctx.orgId },
      select: { id: true, boqNo: true },
    });
    boqNoById = new Map<string, string>(
      boqRows.map((r) => [r.id, r.boqNo]),
    );
  }

  let data = rows.map((r) => enrichDPR(r, r.project, boqNoById));

  // Per-row Approve/Reject visibility — driven by the workflow's current
  // step, not the caller's role. Batch-load every pending instance + its
  // workflow.steps in one round-trip and decorate each row with
  // `canActOnCurrentStep`. Rows without an approvalId get false.
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
    return {
      ...row,
      canActOnCurrentStep: instance
        ? canActOnCurrentStep(actor, instance, row.projectId ?? null)
        : false,
    };
  });

  if (search) {
    data = data.filter((d) =>
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
}

export async function POST(req: NextRequest) {
  try {
    const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
    if (!hasMatrixAction(ctx, "pm.dpr", "add")) {
      return envelopeErr("FORBIDDEN", `Action "add" not allowed for pm.dpr`, 403);
    }

    const body: DprCreateBody = await req.json();

    if (!body.projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

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

    const reportDateStr =
      body.reportDate ?? new Date().toISOString().split("T")[0];
    const compactDate = String(reportDateStr).replace(/-/g, "");
    const slug =
      String(project.code ?? project.name ?? "SITE")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
        .slice(0, 6) || "SITE";

    const sameDayCount = await db.cnDailyProgressReport.count({
      where: {
        orgId: ctx.orgId,
        projectId: body.projectId,
        reportDate: new Date(reportDateStr),
      },
    });
    const seq = String(sameDayCount + 1).padStart(3, "0");
    const dprNumber = body.dprNumber ?? `DPR-${slug}-${compactDate}-${seq}`;

    const requestedStatus = body.status === "submitted" ? "submitted" : "draft";

    const workItems: DprBodyWorkItem[] = Array.isArray(body.workItems ?? body.items)
      ? body.workItems ?? body.items ?? []
      : [];
    const materials: DprBodyMaterial[] = Array.isArray(body.materials) ? body.materials : [];
    const manpower: DprBodyManpower[] = Array.isArray(body.manpower) ? body.manpower : [];
    const machinery: DprBodyMachinery[] = Array.isArray(body.machinery) ? body.machinery : [];
    const staff: DprBodyStaff[] = Array.isArray(body.staff) ? body.staff : [];

    // Upload any new work-item photos to S3 first (outside the DB write) and
    // collect the per-item object keys, aligned to `workItems` order.
    const workItemImageKeys: string[][] = await Promise.all(
      workItems.map((w) =>
        persistDprImages(
          ctx,
          Array.isArray(w.images) ? w.images : [],
          Array.isArray(w.imageKeys) ? w.imageKeys : [],
        ),
      ),
    );

    const created = await db.cnDailyProgressReport.create({
      data: tenantCreate(ctx, {
        dprNumber,
        projectId: project.id,
        reportDate: new Date(reportDateStr),
        submittedById: ctx.userId,
        weatherCondition: body.weatherCondition ?? body.weather ?? null,
        weatherDetail: (parseStoredWeatherDetail(body.weatherDetail) as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
        remarks: body.siteRemarks ?? null,
        consumptionLocationId: body.consumptionLocationId ?? null,
        status: requestedStatus,
        workItems: {
          create: workItems.map((w: DprBodyWorkItem, i: number) => ({
            boqItemId: String(w.boqItemId ?? w.boqNo ?? ""),
            woId: w.woId ?? null,
            description: String(w.description ?? ""),
            todayQty: String(Number(w.todayQty ?? w.qty ?? 0)),
            cumulativeQty: String(Number(w.cumulativeQty ?? w.todayQty ?? w.qty ?? 0)),
            uomId: String(w.uomId ?? ""),
            remarks: w.remarks ?? null,
            images: workItemImageKeys[i] ?? [],
          })),
        },
        labourEntries: {
          create: manpower.map((l) => ({
            category: String(l.category ?? l.role ?? ""),
            skillType: String(l.skillType ?? l.skill ?? ""),
            count: Number(l.count ?? l.headcount ?? 0),
            hoursWorked: String(Number(l.hoursWorked ?? l.hours ?? 0)),
            contractorId: l.contractorId ?? null,
            workingArea: l.workingArea ?? null,
            messan: toDecimalOrNull(l.messan),
            maleHelper: toDecimalOrNull(l.maleHelper),
            femaleHelper: toDecimalOrNull(l.femaleHelper),
            carpenter: toDecimalOrNull(l.carpenter),
            fitter: toDecimalOrNull(l.fitter),
            painter: toDecimalOrNull(l.painter),
            plumber: toDecimalOrNull(l.plumber),
            electrician: toDecimalOrNull(l.electrician),
            operator: toDecimalOrNull(l.operator),
          })),
        },
        machineryEntries: {
          create: machinery.map((m) => ({
            description: String(m.description ?? ""),
            condition: m.condition ?? null,
            requiredQty: Number(m.requiredQty ?? 0),
            actualQty: Number(m.actualQty ?? 0),
            remarks: m.remarks ?? null,
          })),
        },
        materialEntries: {
          create: materials.map((m) => ({
            itemId: String(m.itemId ?? ""),
            consumedQty: String(Number(m.consumedQty ?? m.quantity ?? 0)),
            uomId: String(m.uomId ?? ""),
            remarks: m.remarks ?? null,
          })),
        },
        staffEntries: {
          create: staff.map((s) => ({
            name: String(s.name ?? ""),
            designation: s.designation ?? null,
            present: s.present !== undefined ? !!s.present : true,
            reason: s.reason ?? null,
          })),
        },
      }),
      include: {
        project: { select: { id: true, name: true, code: true } },
        workItems: true,
        labourEntries: true,
        machineryEntries: true,
        materialEntries: true,
        staffEntries: true,
      },
    });

    // Resolve boqItemId → boqNo on the freshly-created rows so the
    // client gets the human-readable BOQ ref back without a refetch.
    const createdBoqIds = Array.from(
      new Set(
        (created.workItems ?? [])
          .map((w) => w.boqItemId)
          .filter((v) => typeof v === "string" && v.length > 0),
      ),
    ) as string[];
    let createdBoqNoById = new Map<string, string>();
    if (createdBoqIds.length) {
      const boqRows = await db.cnBOQItemV2.findMany({
        where: { id: { in: createdBoqIds }, orgId: ctx.orgId },
        select: { id: true, boqNo: true },
      });
      createdBoqNoById = new Map<string, string>(
        boqRows.map((r) => [r.id, r.boqNo]),
      );
    }
    return NextResponse.json(
      enrichDPR(created, created.project, createdBoqNoById),
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A DPR with this number already exists" },
        { status: 409 }
      );
    }
    console.error("[dpr.create] failed:", err);
    return NextResponse.json({ error: toErrorMessage(err) }, { status: 500 });
  }
}
