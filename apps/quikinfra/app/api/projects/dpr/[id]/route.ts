import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import type { Prisma } from "@quikit/database";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenantContext, tenantUpdate, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { parseStoredWeatherDetail } from "@/lib/weather/dpr-weather";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";
import { resolveMaterialMeta } from "@/lib/projects/dpr-material-meta";
import { persistDprImages, signDprImageKeys } from "@/lib/dpr/dpr-images";

/**
 * DPR — per-row endpoints.
 *
 * GET    /api/projects/dpr/:id  → fetch one DPR
 * PUT    /api/projects/dpr/:id  → update (edit flow)
 * DELETE /api/projects/dpr/:id  → soft delete (status = "inactive")
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
  location?: string | null;
  remarks?: string | null;
  images?: unknown;
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
  description?: string | null;
  condition?: string | null;
  requiredQty?: number | null;
  actualQty?: number | null;
  remarks?: string | null;
}
interface DprMaterialRow {
  id: string;
  itemId?: string | null;
  consumedQty?: Numericish;
  uomId?: string | null;
  remarks?: string | null;
}
interface DprStaffRow {
  id: string;
  name?: string | null;
  designation?: string | null;
  present?: boolean | null;
  reason?: string | null;
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
  consumptionLocationId?: string | null;
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
  staffEntries?: DprStaffRow[];
}

// Body-input element shapes (request payload from the DPR form).
interface DprBodyWorkItem {
  boqItemId?: string;
  boqNo?: string;
  // Contractor/WO selector: the form sends `workOrderId`; accept `woId` too.
  workOrderId?: string | null;
  woId?: string | null;
  description?: string;
  todayQty?: number | string;
  qty?: number | string;
  cumulativeQty?: number | string;
  uomId?: string;
  location?: string | null;
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
interface DprUpdateBody {
  projectId?: string;
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

async function enrichDPR(row: DprRow, project?: DprProject) {
  // Resolve boqItemId → boqNo so the detail UI can show "1.1.2a" instead
  // of the raw cuid. We only persist boqItemId on the DPR work item, so
  // the join has to happen at read time.
  const boqItemIds = Array.from(
    new Set(
      (row.workItems ?? [])
        .map((w) => w.boqItemId)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  // Pull boqNo + unit + scope from the BOQ item. The DPR work item only
  // persists boqItemId/qtys, so Unit and Total Target are resolved here at
  // read time (same join the boqNo display already relied on).
  let boqInfoById = new Map<string, { boqNo: string; unit: string; scopeQty: number }>();
  if (boqItemIds.length) {
    const boqRows = await db.cnBOQItemV2.findMany({
      where: { id: { in: boqItemIds }, orgId: row.orgId },
      select: { id: true, boqNo: true, unit: true, scopeQty: true },
    });
    boqInfoById = new Map(
      boqRows.map((r) => [
        r.id,
        {
          boqNo: r.boqNo ?? "",
          unit: r.unit ?? "",
          scopeQty: Number(r.scopeQty ?? 0),
        },
      ]),
    );
  }

  const workItems = await Promise.all(
    (row.workItems ?? []).map(async (w) => {
      const keys = Array.isArray(w.images) ? w.images : [];
      const boq = boqInfoById.get(w.boqItemId ?? "") ?? { boqNo: "", unit: "", scopeQty: 0 };
      const todayNum = Number(w.todayQty ?? 0);
      const cumulativeNum = Number(w.cumulativeQty ?? 0);
      // Not stored on the work item — derived so the edit form can show
      // Prev Qty and % Completed: prev = cumulative-before-today.
      const prevQty = Math.max(0, cumulativeNum - todayNum);
      return {
        id: w.id,
        boqItemId: w.boqItemId ?? "",
        boqNo: boq.boqNo,
        // BOQ-derived so the form's Unit / Total Target / % Completed render.
        unit: boq.unit,
        totalTarget: boq.scopeQty,
        prevQty,
        woId: w.woId ?? null,
        // Form's Contractor/WO selector binds to `workOrderId`, not `woId`.
        workOrderId: w.woId ?? null,
        description: w.description ?? "",
        todayQty: w.todayQty?.toString?.() ?? "0",
        cumulativeQty: w.cumulativeQty?.toString?.() ?? "0",
        uomId: w.uomId ?? "",
        location: w.location ?? "",
        remarks: w.remarks ?? "",
        // Stored S3 keys + aligned signed URLs for display. The edit form
        // sends `imageKeys` back so existing photos aren't re-uploaded.
        imageKeys: keys,
        images: await signDprImageKeys(keys),
      };
    }),
  );
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
    description: m.description ?? "",
    condition: m.condition ?? null,
    requiredQty: m.requiredQty ?? 0,
    actualQty: m.actualQty ?? 0,
    remarks: m.remarks ?? null,
  }));
  const matMeta = await resolveMaterialMeta(
    row.orgId ?? "",
    (row.materialEntries ?? []).map((m) => m.itemId),
    (row.materialEntries ?? []).map((m) => m.uomId),
  );
  const materials = (row.materialEntries ?? []).map((m: DprMaterialRow) => ({
    id: m.id,
    itemId: m.itemId ?? "",
    // Denormalized so the edit form's lazy picker shows the name + UOM
    // without loading the whole item master.
    itemName: matMeta.itemNameById.get(m.itemId ?? "") ?? "",
    consumedQty: m.consumedQty?.toString?.() ?? "0",
    uomId: m.uomId ?? "",
    uomCode: matMeta.uomCodeById.get(m.uomId ?? "") ?? "",
    remarks: m.remarks ?? null,
  }));
  const staff = (row.staffEntries ?? []).map((s: DprStaffRow) => ({
    id: s.id,
    name: s.name ?? "",
    designation: s.designation ?? "",
    present: s.present ?? true,
    reason: s.reason ?? "",
  }));

  return {
    id: row.id,
    dprNumber: row.dprNumber,
    orgId: row.orgId,
    projectId: row.projectId,
    projectName: project?.name ?? "",
    consumptionLocationId: row.consumptionLocationId ?? null,
    reportDate: row.reportDate?.toISOString?.().slice(0, 10) ?? "",
    weatherCondition: row.weatherCondition ?? "",
    weatherDetail: parseStoredWeatherDetail(row.weatherDetail) ?? null,
    siteRemarks: row.remarks ?? "",
    workHalted: false,
    workItems,
    materials,
    manpower: labour,
    staff,
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

  const row = await db.cnDailyProgressReport.findFirst({
    where: { id: ctx.params.id, orgId: auth.orgId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      workItems: true,
      labourEntries: true,
      machineryEntries: true,
      materialEntries: true,
      staffEntries: true,
    },
  });
  if (!row || row.status === "inactive") {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }

  // Join the approval instance (if any) so the detail page can render
  // the timeline without a second fetch. Mirrors the WO detail route.
  let approval: Record<string, unknown> | null = null;
  if (row.approvalId) {
    const instance = await db.cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: auth.orgId },
      include: {
        history: { orderBy: { actionAt: "asc" } },
        workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      },
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
          userId: auth.userId,
          roleKey: auth.roleKey,
          projectIds: auth.projectIds,
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
          steps: instance.workflow.steps.map((s) => ({
            stepOrder: s.stepOrder,
            approverRoleId: s.approverRoleId,
            approverUserId: s.approverUserId,
            approverUserName: s.approverUserId
              ? (nameById.get(s.approverUserId) ?? null)
              : null,
          })),
        },
        history: instance.history.map((h) => ({
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

  const rowApprovedBy = (row as { approvedBy?: string | null }).approvedBy;
  const auditNames = await resolveUserNames([
    row.createdBy,
    row.updatedBy,
    rowApprovedBy,
  ]);

  return NextResponse.json({
    ...(await enrichDPR(row, row.project)),
    approval,
    createdByName: auditNames.get(row.createdBy) ?? row.createdBy,
    updatedByName: auditNames.get(row.updatedBy) ?? row.updatedBy,
    approvedByName: rowApprovedBy
      ? auditNames.get(rowApprovedBy) ?? rowApprovedBy
      : null,
  });
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const auth = await getTenantContext();
    if (!auth)
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (!hasMatrixAction(auth, "pm.dpr", "edit")) {
      return envelopeErr("FORBIDDEN", `Action "edit" not allowed for pm.dpr`, 403);
    }

    const existing = await db.cnDailyProgressReport.findFirst({
      where: { id: ctx.params.id, orgId: auth.orgId },
    });
    if (!existing || existing.status === "inactive") {
      return NextResponse.json({ error: "DPR not found" }, { status: 404 });
    }
    const guard = requireOwnership(existing, auth, "DPR");
    if (guard) return guard;

    const body: DprUpdateBody = await req.json();

    let projectId = existing.projectId;
    if (body.projectId && body.projectId !== existing.projectId) {
      const project = await db.cnProject.findFirst({
        where: { id: body.projectId, orgId: auth.orgId },
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
    if (body.weatherDetail !== undefined) {
      if (body.weatherDetail === null) {
        data.weatherDetail = null;
      } else {
        const wd = parseStoredWeatherDetail(body.weatherDetail);
        data.weatherDetail = wd;
      }
    }
    if (body.siteRemarks !== undefined) data.remarks = body.siteRemarks;
    if (body.consumptionLocationId !== undefined) {
      data.consumptionLocationId = body.consumptionLocationId ?? null;
    }
    if (body.status === "submitted" || body.status === "draft") {
      data.status = body.status;
    }

    const hasWorkItems = Array.isArray(body.workItems ?? body.items);
    const hasMaterials = Array.isArray(body.materials);
    const hasManpower = Array.isArray(body.manpower);
    const hasMachinery = Array.isArray(body.machinery);
    const hasStaff = Array.isArray(body.staff);

    // Upload any new work-item photos to S3 BEFORE the DB transaction (keep
    // slow object-store calls out of the txn). Existing photos keep their key.
    const workItemImageKeys: string[][] = hasWorkItems
      ? await Promise.all(
          (body.workItems ?? body.items ?? []).map((w: DprBodyWorkItem) =>
            persistDprImages(
              auth,
              Array.isArray(w.images) ? w.images : [],
              Array.isArray(w.imageKeys) ? w.imageKeys : [],
            ),
          ),
        )
      : [];

    await db.$transaction(async (tx) => {
      await tx.cnDailyProgressReport.update({
        where: { id: ctx.params.id },
        data: tenantUpdate(auth, data),
      });

      if (hasWorkItems) {
        await tx.cnDPRWorkItem.deleteMany({ where: { dprId: ctx.params.id } });
        const items = body.workItems ?? body.items ?? [];
        if (items.length > 0) {
          await tx.cnDPRWorkItem.createMany({
            data: items.map((w: DprBodyWorkItem, i: number) => ({
              dprId: ctx.params.id,
              boqItemId: String(w.boqItemId ?? w.boqNo ?? ""),
              woId: w.workOrderId ?? w.woId ?? null,
              description: String(w.description ?? ""),
              todayQty: String(Number(w.todayQty ?? w.qty ?? 0)),
              cumulativeQty: String(Number(w.cumulativeQty ?? w.todayQty ?? w.qty ?? 0)),
              uomId: String(w.uomId ?? ""),
              location: w.location ?? null,
              remarks: w.remarks ?? null,
              images: workItemImageKeys[i] ?? [],
            })),
          });
        }
      }

      if (hasMaterials) {
        await tx.cnDPRMaterialEntry.deleteMany({ where: { dprId: ctx.params.id } });
        if ((body.materials ?? []).length > 0) {
          await tx.cnDPRMaterialEntry.createMany({
            data: (body.materials ?? []).map((m: DprBodyMaterial) => ({
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
        if ((body.manpower ?? []).length > 0) {
          await tx.cnDPRLabourEntry.createMany({
            data: (body.manpower ?? []).map((l: DprBodyManpower) => ({
              dprId: ctx.params.id,
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
          });
        }
      }

      if (hasMachinery) {
        await tx.cnDPRMachineryEntry.deleteMany({ where: { dprId: ctx.params.id } });
        if ((body.machinery ?? []).length > 0) {
          await tx.cnDPRMachineryEntry.createMany({
            data: (body.machinery ?? []).map((m: DprBodyMachinery) => ({
              dprId: ctx.params.id,
              description: String(m.description ?? ""),
              condition: m.condition ?? null,
              requiredQty: Number(m.requiredQty ?? 0),
              actualQty: Number(m.actualQty ?? 0),
              remarks: m.remarks ?? null,
            })),
          });
        }
      }

      if (hasStaff) {
        await tx.cnDPRStaff.deleteMany({ where: { dprId: ctx.params.id } });
        if ((body.staff ?? []).length > 0) {
          await tx.cnDPRStaff.createMany({
            data: (body.staff ?? []).map((s: DprBodyStaff) => ({
              dprId: ctx.params.id,
              name: String(s.name ?? ""),
              designation: s.designation ?? null,
              present: s.present !== undefined ? !!s.present : true,
              reason: s.reason ?? null,
            })),
          });
        }
      }
    });

    const updated = await db.cnDailyProgressReport.findFirst({
      where: { id: ctx.params.id },
      include: {
        project: { select: { id: true, name: true, code: true } },
        workItems: true,
        labourEntries: true,
        machineryEntries: true,
        materialEntries: true,
        staffEntries: true,
      },
    });
    if (!updated) {
      return NextResponse.json({ error: "DPR not found" }, { status: 404 });
    }
    return NextResponse.json(await enrichDPR(updated, updated.project));
  } catch (err: unknown) {
    return NextResponse.json({ error: toErrorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const auth = await getTenantContext();
  if (!auth)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(auth, "pm.dpr", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for pm.dpr`, 403);
  }

  const existing = await db.cnDailyProgressReport.findFirst({
    where: { id: ctx.params.id, orgId: auth.orgId },
    select: { id: true, createdBy: true, status: true },
  });
  if (!existing || existing.status === "inactive") {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, auth, "DPR");
  if (guard) return guard;

  const res = await db.cnDailyProgressReport.updateMany({
    where: { id: ctx.params.id, orgId: auth.orgId },
    data: { status: "inactive", updatedBy: auth.userId },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }
  const refreshed = await db.cnDailyProgressReport.findFirst({
    where: { id: ctx.params.id },
    include: {
      project: { select: { id: true, name: true, code: true } },
      workItems: true,
      labourEntries: true,
      machineryEntries: true,
      materialEntries: true,
      staffEntries: true,
    },
  });
  if (!refreshed) {
    return NextResponse.json({ error: "DPR not found" }, { status: 404 });
  }
  return NextResponse.json(await enrichDPR(refreshed, refreshed.project));
}
