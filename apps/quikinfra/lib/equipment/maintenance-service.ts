/**
 * Maintenance job cards — breakdown / preventive with spares + costing.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { computeJobCardTotal } from "@/lib/equipment/equipment-calculations";
import type {
  JobCardRecord,
  JobCardSpareRecord,
  JobCardStatus,
  JobCardType,
  MaintenanceDueRecord,
} from "@/lib/equipment/equipment-types";
import type { JobCardSpareJson } from "@/lib/equipment/equipment-record-types";

export type {
  JobCardRecord,
  JobCardSpareRecord,
  JobCardStatus,
  JobCardType,
  MaintenanceDueRecord,
};
export { computeJobCardTotal };

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function nextJobNumber(orgId: string): Promise<string> {
  const count = await db.cnMaintenanceJobCard.count({ where: { orgId } });
  return `MJC-${String(count + 1).padStart(4, "0")}`;
}

const cardInclude = {
  equipment: { select: { code: true, name: true, type: true } },
  project: { select: { name: true } },
} as const;

function parseSparesJson(raw: unknown): JobCardSpareRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const s = item as JobCardSpareJson;
    return {
      id: s.id ?? `spare-${index}`,
      description: String(s.description ?? ""),
      qty: num(s.qty) ?? 0,
      rate: num(s.rate) ?? 0,
      amount: num(s.amount) ?? 0,
    };
  });
}

function sparesToJson(spares: SpareInput[]): JobCardSpareJson[] {
  return spares.map((s) => ({
    id: crypto.randomUUID(),
    description: s.description.trim(),
    qty: String(s.qty),
    rate: String(s.rate),
    amount: String(round2(s.qty * s.rate)),
  }));
}

function toRecord(
  row: Prisma.CnMaintenanceJobCardGetPayload<{ include: typeof cardInclude }>,
): JobCardRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    jobNumber: row.jobNumber,
    equipmentId: row.equipmentId,
    equipmentCode: row.equipment.code,
    equipmentName: row.equipment.name,
    equipmentType: row.equipment.type,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    jobType: row.jobType as JobCardType,
    serviceDate: row.serviceDate.toISOString().slice(0, 10),
    meterAtService: num(row.meterAtService),
    downtimeHours: num(row.downtimeHours),
    reportedProblem: row.reportedProblem,
    labourCost: num(row.labourCost) ?? 0,
    serviceCost: num(row.serviceCost) ?? 0,
    totalCost: num(row.totalCost) ?? 0,
    spares: parseSparesJson(row.spares),
    remarks: row.remarks,
    status: row.status as JobCardStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListJobCardsOptions {
  orgId: string;
  projectId?: string;
  equipmentId?: string;
  status?: string;
  projectIds?: string[];
  search?: string;
  orderBy?: Prisma.CnMaintenanceJobCardOrderByWithRelationInput[];
  take?: number;
  skip?: number;
}

function buildWhere(opts: ListJobCardsOptions): Prisma.CnMaintenanceJobCardWhereInput {
  const where: Prisma.CnMaintenanceJobCardWhereInput = { orgId: opts.orgId };
  if (Array.isArray(opts.projectIds) && opts.projectIds.length > 0) {
    where.projectId = { in: opts.projectIds };
  }
  if (opts.projectId) where.projectId = opts.projectId;
  if (opts.equipmentId) where.equipmentId = opts.equipmentId;
  if (opts.status && opts.status !== "all") where.status = opts.status;
  const search = opts.search?.trim();
  if (search) {
    where.OR = [
      { jobNumber: { contains: search, mode: "insensitive" } },
      { reportedProblem: { contains: search, mode: "insensitive" } },
      { remarks: { contains: search, mode: "insensitive" } },
      { equipment: { code: { contains: search, mode: "insensitive" } } },
      { equipment: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function listJobCards(opts: ListJobCardsOptions) {
  const where = buildWhere(opts);
  const [rows, total] = await Promise.all([
    db.cnMaintenanceJobCard.findMany({
      where,
      include: cardInclude,
      orderBy: opts.orderBy ?? [{ serviceDate: "desc" }, { createdAt: "desc" }],
      ...(opts.take != null ? { take: opts.take, skip: opts.skip ?? 0 } : {}),
    }),
    db.cnMaintenanceJobCard.count({ where }),
  ]);
  return { data: rows.map(toRecord), total };
}

export async function getJobCardSummary(opts: ListJobCardsOptions) {
  const where = buildWhere(opts);
  const [dueList, cards] = await Promise.all([
    getMaintenanceDue({ orgId: opts.orgId, projectIds: opts.projectIds }),
    db.cnMaintenanceJobCard.findMany({
      where,
      select: { status: true, totalCost: true },
    }),
  ]);

  let openJobCards = 0;
  let maintenanceCost = 0;
  for (const c of cards) {
    if (c.status === "open") openJobCards += 1;
    if (c.status !== "cancelled") {
      maintenanceCost += num(c.totalCost) ?? 0;
    }
  }

  return {
    overdue: dueList.filter((d) => d.dueState === "overdue").length,
    dueSoon: dueList.filter((d) => d.dueState === "due_soon").length,
    openJobCards,
    maintenanceCost: round2(maintenanceCost),
  };
}

export interface SpareInput {
  description: string;
  qty: number;
  rate: number;
}

export interface CreateJobCardInput {
  orgId: string;
  userId: string;
  equipmentId: string;
  projectId?: string | null;
  jobType?: JobCardType;
  serviceDate: string;
  meterAtService?: number | null;
  downtimeHours?: number | null;
  reportedProblem?: string | null;
  labourCost?: number;
  serviceCost?: number;
  spares?: SpareInput[];
  remarks?: string | null;
}

export async function createJobCard(input: CreateJobCardInput) {
  const equipment = await db.cnMachinery.findFirst({
    where: { id: input.equipmentId, orgId: input.orgId },
    select: { id: true },
  });
  if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");

  const spares = (input.spares ?? []).filter((s) => s.description?.trim());
  const labourCost = input.labourCost ?? 0;
  const serviceCost = input.serviceCost ?? 0;
  const totalCost = computeJobCardTotal(spares, labourCost, serviceCost);
  const jobNumber = await nextJobNumber(input.orgId);

  const created = await db.$transaction(async (tx) => {
    const card = await tx.cnMaintenanceJobCard.create({
      data: {
        orgId: input.orgId,
        jobNumber,
        equipmentId: input.equipmentId,
        projectId: input.projectId ?? null,
        jobType: input.jobType ?? "breakdown",
        serviceDate: new Date(input.serviceDate),
        meterAtService:
          input.meterAtService != null ? String(input.meterAtService) : null,
        downtimeHours:
          input.downtimeHours != null ? String(input.downtimeHours) : "0",
        reportedProblem: input.reportedProblem ?? null,
        labourCost: String(labourCost),
        serviceCost: String(serviceCost),
        totalCost: String(totalCost),
        remarks: input.remarks ?? null,
        status: "open",
        spares: sparesToJson(spares) as unknown as Prisma.InputJsonValue,
        createdBy: input.userId,
        updatedBy: input.userId,
      },
      include: cardInclude,
    });

    await tx.cnMachinery.update({
      where: { id: input.equipmentId },
      data: { status: "under_maintenance", updatedBy: input.userId },
    });

    return card;
  });

  return toRecord(created);
}

export async function getJobCardById(orgId: string, id: string) {
  const row = await db.cnMaintenanceJobCard.findFirst({
    where: { id, orgId },
    include: cardInclude,
  });
  return row ? toRecord(row) : null;
}

export async function patchJobCard(input: {
  orgId: string;
  userId: string;
  id: string;
  action: "close" | "cancel";
}) {
  const existing = await db.cnMaintenanceJobCard.findFirst({
    where: { id: input.id, orgId: input.orgId },
    select: {
      id: true,
      equipmentId: true,
      status: true,
      meterAtService: true,
    },
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status !== "open") throw new Error("INVALID_STATUS");

  if (input.action === "cancel") {
    const updated = await db.$transaction(async (tx) => {
      const card = await tx.cnMaintenanceJobCard.update({
        where: { id: input.id },
        data: { status: "cancelled", updatedBy: input.userId },
        include: cardInclude,
      });

      const otherOpen = await tx.cnMaintenanceJobCard.count({
        where: {
          equipmentId: existing.equipmentId,
          status: "open",
          id: { not: input.id },
        },
      });
      if (otherOpen === 0) {
        await tx.cnMachinery.update({
          where: { id: existing.equipmentId },
          data: { status: "active", updatedBy: input.userId },
        });
      }
      return card;
    });
    return toRecord(updated);
  }

  const updated = await db.$transaction(async (tx) => {
    const card = await tx.cnMaintenanceJobCard.update({
      where: { id: input.id },
      data: { status: "closed", updatedBy: input.userId },
      include: cardInclude,
    });

    const meter = num(existing.meterAtService);
    const machineUpdate: Prisma.CnMachineryUpdateInput = {
      updatedBy: input.userId,
    };
    if (meter != null) {
      machineUpdate.lastServiceMeter = String(meter);
    }

    const otherOpen = await tx.cnMaintenanceJobCard.count({
      where: {
        equipmentId: existing.equipmentId,
        status: "open",
        id: { not: input.id },
      },
    });
    if (otherOpen === 0) {
      machineUpdate.status = "active";
    }

    await tx.cnMachinery.update({
      where: { id: existing.equipmentId },
      data: machineUpdate,
    });

    return card;
  });

  return toRecord(updated);
}

export async function getMaintenanceDue(opts: {
  orgId: string;
  projectIds?: string[];
}) {
  const where: Prisma.CnMachineryWhereInput = {
    orgId: opts.orgId,
    status: { not: "disposed" },
    serviceIntervalValue: { not: null },
  };
  if (Array.isArray(opts.projectIds) && opts.projectIds.length > 0) {
    where.projectId = { in: opts.projectIds };
  }

  const machines = await db.cnMachinery.findMany({
    where,
    select: {
      id: true,
      code: true,
      name: true,
      currentMeter: true,
      lastServiceMeter: true,
      serviceIntervalValue: true,
      serviceIntervalUnit: true,
    },
  });

  const now = Date.now();
  const data: MaintenanceDueRecord[] = [];

  for (const m of machines) {
    const interval = num(m.serviceIntervalValue);
    const unit = (m.serviceIntervalUnit ?? "hours").toLowerCase();
    if (!interval || interval <= 0) continue;

    let since = 0;
    if (unit === "days") {
      const lastClosed = await db.cnMaintenanceJobCard.findFirst({
        where: {
          orgId: opts.orgId,
          equipmentId: m.id,
          jobType: "preventive",
          status: "closed",
        },
        orderBy: { serviceDate: "desc" },
        select: { serviceDate: true },
      });
      const base = lastClosed?.serviceDate ?? new Date(0);
      since = Math.floor((now - base.getTime()) / (1000 * 60 * 60 * 24));
    } else {
      const current = num(m.currentMeter) ?? 0;
      const last = num(m.lastServiceMeter) ?? 0;
      since = Math.max(0, current - last);
    }

    const ratio = since / interval;
    let dueState: MaintenanceDueRecord["dueState"] = "ok";
    if (ratio >= 1) dueState = "overdue";
    else if (ratio >= 0.9) dueState = "due_soon";

    if (dueState === "ok") continue;

    data.push({
      equipmentId: m.id,
      equipmentCode: m.code,
      equipmentName: m.name,
      serviceIntervalValue: interval,
      serviceIntervalUnit: m.serviceIntervalUnit,
      currentMeter: num(m.currentMeter),
      lastServiceMeter: num(m.lastServiceMeter),
      since: round2(since),
      dueState,
    });
  }

  data.sort((a, b) => {
    const order = { overdue: 0, due_soon: 1, ok: 2 };
    return order[a.dueState] - order[b.dueState];
  });

  return data;
}
