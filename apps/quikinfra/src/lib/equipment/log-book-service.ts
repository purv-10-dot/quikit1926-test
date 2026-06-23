/**
 * Equipment Log Book — daily machine logs with approval workflow.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import {
  computeFuelRate,
  computeRun,
} from "@/lib/equipment/equipment-calculations";
import type {
  EquipmentLogRecord,
  FuelReconciliationRow,
  LogStatus,
} from "@/lib/equipment/equipment-types";

export type { EquipmentLogRecord, FuelReconciliationRow, LogStatus };
export { computeRun, computeFuelRate };

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function isFuelAnomaly(
  fuelRate: number | null,
  fuelNorm: number | null,
  dieselIssued: number | null,
  run: number | null,
): boolean {
  if (dieselIssued != null && dieselIssued > 0 && (run == null || run <= 0)) {
    return true;
  }
  if (fuelRate == null || fuelNorm == null || fuelNorm <= 0) return false;
  return fuelRate > fuelNorm * 1.1;
}

function normalizeLogStatus(status: string): LogStatus {
  if (status === "submitted") return "pending_approval";
  return status as LogStatus;
}

function isPendingLogStatus(status: string): boolean {
  return status === "pending_approval" || status === "submitted";
}

export function formatEquipmentLogEntityNumber(row: {
  equipment: { code: string };
  logDate: Date;
  shift: string;
}): string {
  const date = row.logDate.toISOString().slice(0, 10);
  return `${row.equipment.code} · ${date} · ${row.shift}`;
}

function toRecord(
  row: Prisma.CnEquipmentLogGetPayload<{
    include: {
      equipment: { select: { code: true; name: true; type: true; meterType: true; fuelNorm: true } };
      project: { select: { name: true } };
    };
  }>,
): EquipmentLogRecord {
  const run = num(row.run);
  const fuelRate = num(row.fuelRate);
  const fuelNorm = num(row.equipment.fuelNorm);
  return {
    id: row.id,
    orgId: row.orgId,
    equipmentId: row.equipmentId,
    equipmentCode: row.equipment.code,
    equipmentName: row.equipment.name,
    equipmentType: row.equipment.type,
    meterType: row.equipment.meterType ?? "hour",
    fuelNorm,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    logDate: row.logDate.toISOString().slice(0, 10),
    shift: row.shift,
    openingMeter: num(row.openingMeter),
    closingMeter: num(row.closingMeter),
    meterReset: row.meterReset,
    run,
    idleHours: num(row.idleHours),
    breakdownHours: num(row.breakdownHours),
    dieselIssued: num(row.dieselIssued),
    fuelRate,
    fuelAnomaly: isFuelAnomaly(fuelRate, fuelNorm, num(row.dieselIssued), run),
    operatorName: row.operatorName,
    productivityQty: num(row.productivityQty),
    outputUom: row.outputUom,
    remarks: row.remarks,
    status: normalizeLogStatus(row.status),
    approvalId: row.approvalId,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

const logInclude = {
  equipment: {
    select: { code: true, name: true, type: true, meterType: true, fuelNorm: true },
  },
  project: { select: { name: true } },
} as const;

export interface ListLogsOptions {
  orgId: string;
  projectId?: string;
  equipmentId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  projectIds?: string[];
  take?: number;
  skip?: number;
}

function buildWhere(opts: ListLogsOptions): Prisma.CnEquipmentLogWhereInput {
  const where: Prisma.CnEquipmentLogWhereInput = { orgId: opts.orgId };

  if (Array.isArray(opts.projectIds) && opts.projectIds.length > 0) {
    where.projectId = { in: opts.projectIds };
  }
  if (opts.projectId) where.projectId = opts.projectId;
  if (opts.equipmentId) where.equipmentId = opts.equipmentId;
  if (opts.status && opts.status !== "all") {
    if (opts.status === "pending_approval") {
      where.status = { in: ["pending_approval", "submitted"] };
    } else {
      where.status = opts.status;
    }
  }
  if (opts.fromDate || opts.toDate) {
    const range: Prisma.DateTimeFilter = {};
    if (opts.fromDate) range.gte = new Date(opts.fromDate);
    if (opts.toDate) range.lte = new Date(opts.toDate);
    where.logDate = range;
  }
  return where;
}

export async function listEquipmentLogs(opts: ListLogsOptions) {
  const where = buildWhere(opts);
  const [rows, total] = await Promise.all([
    db.cnEquipmentLog.findMany({
      where,
      include: logInclude,
      orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
      ...(opts.take != null ? { take: opts.take, skip: opts.skip ?? 0 } : {}),
    }),
    db.cnEquipmentLog.count({ where }),
  ]);
  return { data: rows.map(toRecord), total };
}

export async function getEquipmentLogSummary(opts: ListLogsOptions) {
  const where = buildWhere(opts);
  const rows = await db.cnEquipmentLog.findMany({
    where,
    select: {
      status: true,
      run: true,
      breakdownHours: true,
      dieselIssued: true,
    },
  });

  let pendingApproval = 0;
  let runTotal = 0;
  let breakdownTotal = 0;
  let dieselTotal = 0;

  for (const row of rows) {
    if (isPendingLogStatus(row.status)) pendingApproval += 1;
    if (row.status === "approved") {
      runTotal += num(row.run) ?? 0;
      breakdownTotal += num(row.breakdownHours) ?? 0;
      dieselTotal += num(row.dieselIssued) ?? 0;
    }
  }

  return {
    logEntries: rows.length,
    pendingApproval,
    runHoursKm: Math.round(runTotal),
    breakdownHrs: Math.round(breakdownTotal),
    dieselLitres: Math.round(dieselTotal),
  };
}

export interface CreateLogInput {
  orgId: string;
  userId: string;
  equipmentId: string;
  projectId?: string | null;
  logDate: string;
  shift?: string;
  openingMeter?: number | null;
  closingMeter?: number | null;
  meterReset?: boolean;
  idleHours?: number | null;
  breakdownHours?: number | null;
  dieselIssued?: number | null;
  operatorName?: string | null;
  productivityQty?: number | null;
  outputUom?: string | null;
  remarks?: string | null;
}

export async function findEquipmentLogRow(orgId: string, id: string) {
  return db.cnEquipmentLog.findFirst({
    where: { id, orgId },
    include: {
      equipment: { select: { code: true, currentMeter: true } },
    },
  });
}

export async function patchEquipmentLogWorkflowStatus(
  orgId: string,
  id: string,
  data: {
    status: string;
    approvalId?: string | null;
    submittedAt?: Date | null;
    submittedBy?: string | null;
    approvedAt?: Date | null;
    approvedBy?: string | null;
    rejectedAt?: Date | null;
    rejectedBy?: string | null;
    rejectReason?: string | null;
    returnedAt?: Date | null;
    returnedBy?: string | null;
    returnReason?: string | null;
    updatedBy: string;
  },
) {
  const updated = await db.cnEquipmentLog.update({
    where: { id },
    data: {
      status: data.status,
      approvalId: data.approvalId,
      submittedAt: data.submittedAt,
      submittedBy: data.submittedBy,
      approvedAt: data.approvedAt,
      approvedBy: data.approvedBy,
      rejectedAt: data.rejectedAt,
      rejectedBy: data.rejectedBy,
      rejectReason: data.rejectReason,
      returnedAt: data.returnedAt,
      returnedBy: data.returnedBy,
      returnReason: data.returnReason,
      updatedBy: data.updatedBy,
    },
    include: logInclude,
  });
  if (updated.orgId !== orgId) throw new Error("NOT_FOUND");
  return toRecord(updated);
}

export async function finalizeEquipmentLogApprovalInTxn(
  tx: Prisma.TransactionClient,
  orgId: string,
  logId: string,
  userId: string,
) {
  const existing = await tx.cnEquipmentLog.findFirst({
    where: { id: logId, orgId },
    include: { equipment: { select: { currentMeter: true } } },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const closingMeter = num(existing.closingMeter);
  const meterReset = existing.meterReset;
  const currentMeter = num(existing.equipment.currentMeter) ?? 0;
  const newMeter =
    meterReset && closingMeter != null
      ? closingMeter
      : closingMeter != null
        ? Math.max(currentMeter, closingMeter)
        : currentMeter;

  await tx.cnEquipmentLog.update({
    where: { id: logId },
    data: { status: "approved", updatedBy: userId },
  });
  await tx.cnMachinery.update({
    where: { id: existing.equipmentId },
    data: { currentMeter: String(newMeter), updatedBy: userId },
  });
}

export async function finalizeEquipmentLogApproval(
  orgId: string,
  logId: string,
  userId: string,
) {
  await db.$transaction((tx) =>
    finalizeEquipmentLogApprovalInTxn(tx, orgId, logId, userId),
  );
  const row = await getEquipmentLogById(orgId, logId);
  if (!row) throw new Error("NOT_FOUND");
  return row;
}


export async function createEquipmentLog(input: CreateLogInput) {
  const equipment = await db.cnMachinery.findFirst({
    where: { id: input.equipmentId, orgId: input.orgId },
    select: { id: true, currentMeter: true },
  });
  if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");

  const logDate = new Date(input.logDate);
  const shift = input.shift?.trim() || "Day";
  const meterReset = input.meterReset === true;
  const openingMeter =
    input.openingMeter != null
      ? input.openingMeter
      : num(equipment.currentMeter);
  const closingMeter = input.closingMeter ?? null;

  if (closingMeter == null) throw new Error("CLOSING_METER_REQUIRED");
  if (!meterReset && openingMeter != null && closingMeter < openingMeter) {
    throw new Error("CLOSING_LT_OPENING");
  }

  const duplicate = await db.cnEquipmentLog.findFirst({
    where: {
      orgId: input.orgId,
      equipmentId: input.equipmentId,
      logDate,
      shift,
      status: { not: "rejected" },
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("DUPLICATE_LOG");

  const run = computeRun(openingMeter, closingMeter, meterReset);
  const dieselIssued = num(input.dieselIssued) ?? 0;
  const fuelRate = computeFuelRate(dieselIssued, run);

  const created = await db.cnEquipmentLog.create({
    data: {
      orgId: input.orgId,
      equipmentId: input.equipmentId,
      projectId: input.projectId ?? null,
      logDate,
      shift,
      openingMeter: openingMeter != null ? String(openingMeter) : null,
      closingMeter: String(closingMeter),
      meterReset,
      run: run != null ? String(run) : null,
      idleHours: input.idleHours != null ? String(input.idleHours) : "0",
      breakdownHours:
        input.breakdownHours != null ? String(input.breakdownHours) : "0",
      dieselIssued: String(dieselIssued),
      fuelRate: fuelRate != null ? String(fuelRate) : null,
      operatorName: input.operatorName ?? null,
      productivityQty:
        input.productivityQty != null ? String(input.productivityQty) : null,
      outputUom: input.outputUom ?? null,
      remarks: input.remarks ?? null,
      status: "draft",
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: logInclude,
  });

  return toRecord(created);
}

export async function getEquipmentLogById(orgId: string, id: string) {
  const row = await db.cnEquipmentLog.findFirst({
    where: { id, orgId },
    include: logInclude,
  });
  return row ? toRecord(row) : null;
}

export interface PatchLogInput {
  orgId: string;
  userId: string;
  id: string;
  action?: "save_draft";
  equipmentId?: string;
  projectId?: string | null;
  logDate?: string;
  shift?: string;
  openingMeter?: number | null;
  closingMeter?: number | null;
  meterReset?: boolean;
  idleHours?: number | null;
  breakdownHours?: number | null;
  dieselIssued?: number | null;
  operatorName?: string | null;
  productivityQty?: number | null;
  outputUom?: string | null;
  remarks?: string | null;
}

export async function patchEquipmentLog(input: PatchLogInput) {
  const existing = await db.cnEquipmentLog.findFirst({
    where: { id: input.id, orgId: input.orgId },
    include: { equipment: { select: { currentMeter: true } } },
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (existing.status === "approved" || isPendingLogStatus(existing.status)) {
    throw new Error("APPROVED_LOCKED");
  }

  const meterReset = input.meterReset ?? existing.meterReset;
  const openingMeter =
    input.openingMeter != null
      ? input.openingMeter
      : num(existing.openingMeter);
  const closingMeter =
    input.closingMeter != null
      ? input.closingMeter
      : num(existing.closingMeter);

  if (closingMeter != null && !meterReset && openingMeter != null && closingMeter < openingMeter) {
    throw new Error("CLOSING_LT_OPENING");
  }

  const run = computeRun(openingMeter, closingMeter, meterReset);
  const dieselIssued =
    input.dieselIssued != null ? input.dieselIssued : num(existing.dieselIssued);
  const fuelRate = computeFuelRate(dieselIssued, run);

  const updated = await db.cnEquipmentLog.update({
    where: { id: input.id },
    data: {
      ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.logDate ? { logDate: new Date(input.logDate) } : {}),
      ...(input.shift ? { shift: input.shift } : {}),
      ...(input.openingMeter != null
        ? { openingMeter: String(input.openingMeter) }
        : {}),
      ...(input.closingMeter != null
        ? { closingMeter: String(input.closingMeter) }
        : {}),
      meterReset,
      run: run != null ? String(run) : null,
      ...(input.idleHours != null ? { idleHours: String(input.idleHours) } : {}),
      ...(input.breakdownHours != null
        ? { breakdownHours: String(input.breakdownHours) }
        : {}),
      ...(input.dieselIssued != null
        ? { dieselIssued: String(input.dieselIssued) }
        : {}),
      fuelRate: fuelRate != null ? String(fuelRate) : null,
      ...(input.operatorName !== undefined
        ? { operatorName: input.operatorName }
        : {}),
      ...(input.productivityQty != null
        ? { productivityQty: String(input.productivityQty) }
        : {}),
      ...(input.outputUom !== undefined ? { outputUom: input.outputUom } : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
      ...(input.action === "save_draft" ? { status: "draft" } : {}),
      updatedBy: input.userId,
    },
    include: logInclude,
  });
  return toRecord(updated);
}

export async function getFuelReconciliation(opts: {
  orgId: string;
  projectId?: string;
  fromDate?: string;
  toDate?: string;
  projectIds?: string[];
}) {
  const logWhere = buildWhere({
    orgId: opts.orgId,
    projectId: opts.projectId,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    projectIds: opts.projectIds,
    status: "approved",
  });

  const dieselWhere: Prisma.CnDieselLogWhereInput = { orgId: opts.orgId };
  if (Array.isArray(opts.projectIds) && opts.projectIds.length > 0) {
    dieselWhere.projectId = { in: opts.projectIds };
  }
  if (opts.projectId) dieselWhere.projectId = opts.projectId;
  if (opts.fromDate || opts.toDate) {
    const range: Prisma.DateTimeFilter = {};
    if (opts.fromDate) range.gte = new Date(opts.fromDate);
    if (opts.toDate) range.lte = new Date(opts.toDate);
    dieselWhere.logDate = range;
  }

  const [logs, dieselRows, machinery] = await Promise.all([
    db.cnEquipmentLog.findMany({
      where: logWhere,
      select: {
        equipmentId: true,
        run: true,
        equipment: {
          select: { code: true, name: true, fuelNorm: true },
        },
      },
    }),
    db.cnDieselLog.findMany({
      where: dieselWhere,
      select: { machineryId: true, quantityIssued: true },
    }),
    db.cnMachinery.findMany({
      where: { orgId: opts.orgId },
      select: { id: true, code: true, name: true, fuelNorm: true },
    }),
  ]);

  const runByEquip = new Map<string, number>();
  const dieselByEquip = new Map<string, number>();
  const metaByEquip = new Map<
    string,
    { code: string; name: string; fuelNorm: number | null }
  >();

  for (const m of machinery) {
    metaByEquip.set(m.id, {
      code: m.code,
      name: m.name,
      fuelNorm: num(m.fuelNorm),
    });
  }

  for (const row of logs) {
    runByEquip.set(
      row.equipmentId,
      (runByEquip.get(row.equipmentId) ?? 0) + (num(row.run) ?? 0),
    );
    if (!metaByEquip.has(row.equipmentId)) {
      metaByEquip.set(row.equipmentId, {
        code: row.equipment.code,
        name: row.equipment.name,
        fuelNorm: num(row.equipment.fuelNorm),
      });
    }
  }

  for (const row of dieselRows) {
    dieselByEquip.set(
      row.machineryId,
      (dieselByEquip.get(row.machineryId) ?? 0) + (num(row.quantityIssued) ?? 0),
    );
  }

  const equipmentIds = new Set([
    ...runByEquip.keys(),
    ...dieselByEquip.keys(),
  ]);

  const data: FuelReconciliationRow[] = [];

  for (const equipmentId of equipmentIds) {
    const meta = metaByEquip.get(equipmentId);
    if (!meta) continue;
    const runMeter = runByEquip.get(equipmentId) ?? 0;
    const dieselLitres = dieselByEquip.get(equipmentId) ?? 0;
    const actualLPerUnit =
      runMeter > 0 ? round4(dieselLitres / runMeter) : null;
    const fuelNorm = meta.fuelNorm;
    let variancePct: number | null = null;
    let status: FuelReconciliationRow["status"] = "Balanced";

    if (actualLPerUnit != null && fuelNorm != null && fuelNorm > 0) {
      variancePct = Math.round(((actualLPerUnit - fuelNorm) / fuelNorm) * 1000) / 10;
      if (variancePct > 10) status = "Excess";
      else if (variancePct < -10) status = "Short";
    }

    data.push({
      equipmentId,
      equipmentCode: meta.code,
      equipmentName: meta.name,
      runMeter: round4(runMeter),
      dieselLitres: round4(dieselLitres),
      actualLPerUnit,
      fuelNorm,
      variancePct,
      status,
    });
  }

  data.sort((a, b) => a.equipmentCode.localeCompare(b.equipmentCode));
  return data;
}
