/**
 * Fleet dashboard & machine cost sheet — server-only aggregations.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { deriveDocComplianceState } from "@/lib/equipment/equipment-calculations";
import { DEPLOY_DOCUMENT } from "@/lib/equipment/equipment-record-types";
import { getMaintenanceDue } from "@/lib/equipment/maintenance-service";
import {
  sumApprovedHireInForEquipment,
  sumApprovedRentOutForEquipment,
} from "@/lib/equipment/hire-rent-service";
import type {
  CostSheetPayload,
  FleetDashboardPayload,
  FleetKpis,
  FleetMachineRow,
} from "@/lib/equipment/equipment-types";

export const OPERATOR_DAY_RATE = 0;

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function parseDate(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function dateRangeWhere(
  fromDate?: string,
  toDate?: string,
): { gte?: Date; lte?: Date } | undefined {
  const gte = parseDate(fromDate);
  const lte = parseDate(toDate);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

function utilisationPct(run: number, idle: number, breakdown: number): number | null {
  const total = run + idle + breakdown;
  if (total <= 0) return null;
  return round2((run / total) * 100);
}

function annualDepreciation(capital: number | null, rate: number | null): number {
  if (!capital || capital <= 0 || !rate || rate <= 0) return 0;
  return round2((capital * rate) / 100);
}

function ownershipLabel(t: string): string {
  switch (t) {
    case "hired_in":
      return "Hired-in";
    case "rent_out_eligible":
      return "Rent-out eligible";
    default:
      return "Owned";
  }
}

export interface FleetQueryOpts {
  orgId: string;
  userId?: string;
  projectId?: string;
  projectIds?: string[];
  fromDate?: string;
  toDate?: string;
  /** When true, recompute KPIs from source tables and upsert `Fleet_dashboard`. */
  forceRefresh?: boolean;
}

function fleetCacheKey(opts: FleetQueryOpts): string {
  const project =
    opts.projectId ??
    (opts.projectIds?.length ? opts.projectIds.slice().sort().join(",") : "all");
  return `${project}|${opts.fromDate ?? ""}|${opts.toDate ?? ""}`;
}

async function loadFleetSnapshot(
  orgId: string,
  cacheKey: string,
): Promise<FleetDashboardPayload | null> {
  const row = await db.cnFleetDashboard.findUnique({
    where: { orgId_cacheKey: { orgId, cacheKey } },
    select: { payload: true },
  });
  if (!row?.payload || typeof row.payload !== "object") return null;
  return row.payload as FleetDashboardPayload;
}

async function persistFleetSnapshot(
  opts: FleetQueryOpts,
  payload: FleetDashboardPayload,
): Promise<FleetDashboardPayload> {
  const cacheKey = fleetCacheKey(opts);
  const periodFrom = parseDate(opts.fromDate);
  const periodTo = parseDate(opts.toDate);
  const projectId = opts.projectId ?? null;

  const row = await db.cnFleetDashboard.upsert({
    where: {
      orgId_cacheKey: { orgId: opts.orgId, cacheKey },
    },
    create: {
      orgId: opts.orgId,
      cacheKey,
      projectId,
      periodFrom: periodFrom ?? null,
      periodTo: periodTo ?? null,
      payload: payload as object,
    },
    update: {
      projectId,
      periodFrom: periodFrom ?? null,
      periodTo: periodTo ?? null,
      payload: payload as object,
      computedAt: new Date(),
    },
    select: { payload: true },
  });

  return row.payload as FleetDashboardPayload;
}

async function computeFleetDashboard(
  opts: FleetQueryOpts,
): Promise<FleetDashboardPayload> {
  const projectFilter =
    opts.projectId
      ? [opts.projectId]
      : Array.isArray(opts.projectIds) && opts.projectIds.length > 0
        ? opts.projectIds
        : undefined;

  const machineWhere: Prisma.CnMachineryWhereInput = {
    orgId: opts.orgId,
    status: { not: "disposed" },
  };
  if (projectFilter) machineWhere.projectId = { in: projectFilter };

  const logDateFilter = dateRangeWhere(opts.fromDate, opts.toDate);
  const logWhere: Prisma.CnEquipmentLogWhereInput = {
    orgId: opts.orgId,
    status: "approved",
    ...(logDateFilter ? { logDate: logDateFilter } : {}),
  };
  if (projectFilter) logWhere.projectId = { in: projectFilter };

  const dieselDateFilter = dateRangeWhere(opts.fromDate, opts.toDate);
  const dieselWhere: Prisma.CnDieselLogWhereInput = {
    orgId: opts.orgId,
    ...(dieselDateFilter ? { logDate: dieselDateFilter } : {}),
  };
  if (projectFilter) dieselWhere.projectId = { in: projectFilter };

  const jobDateFilter = dateRangeWhere(opts.fromDate, opts.toDate);
  const jobWhere: Prisma.CnMaintenanceJobCardWhereInput = {
    orgId: opts.orgId,
    status: { not: "cancelled" },
    ...(jobDateFilter ? { serviceDate: jobDateFilter } : {}),
  };
  if (projectFilter) jobWhere.projectId = { in: projectFilter };

  const [machines, logs, dieselLogs, jobCards, dueList, docs] = await Promise.all([
    db.cnMachinery.findMany({
      where: machineWhere,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        status: true,
        meterType: true,
        currentMeter: true,
        fuelNorm: true,
        projectId: true,
        project: { select: { name: true } },
      },
      orderBy: { code: "asc" },
    }),
    db.cnEquipmentLog.findMany({
      where: logWhere,
      select: {
        equipmentId: true,
        run: true,
        idleHours: true,
        breakdownHours: true,
        dieselIssued: true,
        fuelRate: true,
      },
    }),
    db.cnDieselLog.findMany({
      where: dieselWhere,
      select: { machineryId: true, totalCost: true },
    }),
    db.cnMaintenanceJobCard.findMany({
      where: jobWhere,
      select: { equipmentId: true, totalCost: true },
    }),
    getMaintenanceDue({ orgId: opts.orgId, projectIds: projectFilter }),
    db.cnEquipmentDeployment.findMany({
      where: {
        orgId: opts.orgId,
        recordType: DEPLOY_DOCUMENT,
        status: "active",
        equipment: projectFilter
          ? { projectId: { in: projectFilter } }
          : { orgId: opts.orgId, status: { not: "disposed" } },
      },
      select: { expiryDate: true, alertDays: true },
    }),
  ]);

  const logAgg = new Map<
    string,
    { run: number; idle: number; breakdown: number; diesel: number; fuelRateSum: number; fuelRateCount: number }
  >();
  for (const l of logs) {
    const cur = logAgg.get(l.equipmentId) ?? {
      run: 0,
      idle: 0,
      breakdown: 0,
      diesel: 0,
      fuelRateSum: 0,
      fuelRateCount: 0,
    };
    cur.run += num(l.run) ?? 0;
    cur.idle += num(l.idleHours) ?? 0;
    cur.breakdown += num(l.breakdownHours) ?? 0;
    cur.diesel += num(l.dieselIssued) ?? 0;
    const fr = num(l.fuelRate);
    if (fr != null) {
      cur.fuelRateSum += fr;
      cur.fuelRateCount += 1;
    }
    logAgg.set(l.equipmentId, cur);
  }

  const fuelCostByMachine = new Map<string, number>();
  for (const d of dieselLogs) {
    fuelCostByMachine.set(
      d.machineryId,
      (fuelCostByMachine.get(d.machineryId) ?? 0) + (num(d.totalCost) ?? 0),
    );
  }

  const maintCostByMachine = new Map<string, number>();
  for (const j of jobCards) {
    maintCostByMachine.set(
      j.equipmentId,
      (maintCostByMachine.get(j.equipmentId) ?? 0) + (num(j.totalCost) ?? 0),
    );
  }

  let totalFuelCost = 0;
  let utilSum = 0;
  let utilCount = 0;

  const rows: FleetMachineRow[] = machines.map((m) => {
    const agg = logAgg.get(m.id) ?? {
      run: 0,
      idle: 0,
      breakdown: 0,
      diesel: 0,
      fuelRateSum: 0,
      fuelRateCount: 0,
    };
    const fuelCost = round2(fuelCostByMachine.get(m.id) ?? 0);
    const maintenanceCost = round2(maintCostByMachine.get(m.id) ?? 0);
    const costBurn = round2(fuelCost + maintenanceCost);
    totalFuelCost += fuelCost;

    const util = utilisationPct(agg.run, agg.idle, agg.breakdown);
    if (util != null) {
      utilSum += util;
      utilCount += 1;
    }

    let fuelLPerUnit: number | null = null;
    if (agg.run > 0 && agg.diesel > 0) {
      fuelLPerUnit = round4(agg.diesel / agg.run);
    } else if (agg.fuelRateCount > 0) {
      fuelLPerUnit = round4(agg.fuelRateSum / agg.fuelRateCount);
    }

    const fuelNorm = num(m.fuelNorm);
    const fuelFlag =
      fuelLPerUnit != null && fuelNorm != null && fuelNorm > 0
        ? fuelLPerUnit > fuelNorm * 1.1
        : false;

    return {
      id: m.id,
      code: m.code,
      name: m.name,
      type: m.type,
      status: m.status,
      meterType: m.meterType ?? "hour",
      currentMeter: num(m.currentMeter),
      projectId: m.projectId,
      projectName: m.project?.name ?? null,
      run: round2(agg.run),
      idle: round2(agg.idle),
      breakdown: round2(agg.breakdown),
      utilisationPct: util,
      fuelLPerUnit,
      fuelCost,
      maintenanceCost,
      costBurn,
      fuelFlag,
    };
  });

  let docAlerts = 0;
  for (const doc of docs) {
    const state = deriveDocComplianceState(
      doc.expiryDate?.toISOString?.().slice(0, 10) ?? null,
      doc.alertDays,
    );
    if (state === "expired" || state === "expiring") docAlerts += 1;
  }

  const kpis: FleetKpis = {
    machines: machines.length,
    avgUtilisation: utilCount > 0 ? round2(utilSum / utilCount) : 0,
    fuelCost: round2(totalFuelCost),
    maintDue: dueList.filter((d) => d.dueState === "overdue" || d.dueState === "due_soon").length,
    docAlerts,
  };

  return { kpis, machines: rows };
}

export async function getFleetDashboard(
  opts: FleetQueryOpts,
): Promise<FleetDashboardPayload> {
  const cacheKey = fleetCacheKey(opts);

  if (!opts.forceRefresh) {
    const cached = await loadFleetSnapshot(opts.orgId, cacheKey);
    if (cached) return cached;
  }

  const payload = await computeFleetDashboard(opts);
  return persistFleetSnapshot(opts, payload);
}

export async function getCostSheet(opts: {
  orgId: string;
  equipmentId: string;
  fromDate?: string;
  toDate?: string;
}): Promise<CostSheetPayload> {
  const machine = await db.cnMachinery.findFirst({
    where: { id: opts.equipmentId, orgId: opts.orgId },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      ownershipType: true,
      capitalisationCost: true,
      deprRate: true,
    },
  });
  if (!machine) throw new Error("EQUIPMENT_NOT_FOUND");

  const logDateFilter = dateRangeWhere(opts.fromDate, opts.toDate);
  const jobDateFilter = dateRangeWhere(opts.fromDate, opts.toDate);
  const dieselDateFilter = dateRangeWhere(opts.fromDate, opts.toDate);

  const [logs, dieselLogs, jobCards] = await Promise.all([
    db.cnEquipmentLog.findMany({
      where: {
        orgId: opts.orgId,
        equipmentId: opts.equipmentId,
        status: "approved",
        ...(logDateFilter ? { logDate: logDateFilter } : {}),
      },
      select: { run: true, logDate: true },
    }),
    db.cnDieselLog.findMany({
      where: {
        orgId: opts.orgId,
        machineryId: opts.equipmentId,
        ...(dieselDateFilter ? { logDate: dieselDateFilter } : {}),
      },
      select: { totalCost: true },
    }),
    db.cnMaintenanceJobCard.findMany({
      where: {
        orgId: opts.orgId,
        equipmentId: opts.equipmentId,
        status: { not: "cancelled" },
        ...(jobDateFilter ? { serviceDate: jobDateFilter } : {}),
      },
      select: { totalCost: true },
    }),
  ]);

  const periodFrom = parseDate(opts.fromDate);
  const periodTo = parseDate(opts.toDate);

  const [hireCost, rentOutRevenue] = await Promise.all([
    sumApprovedHireInForEquipment({
      orgId: opts.orgId,
      equipmentId: opts.equipmentId,
      fromDate: periodFrom,
      toDate: periodTo,
    }),
    sumApprovedRentOutForEquipment({
      orgId: opts.orgId,
      equipmentId: opts.equipmentId,
      fromDate: periodFrom,
      toDate: periodTo,
    }),
  ]);

  let run = 0;
  const operatorDays = new Set<string>();
  for (const l of logs) {
    run += num(l.run) ?? 0;
    operatorDays.add(l.logDate.toISOString().slice(0, 10));
  }

  const fuelCost = round2(
    dieselLogs.reduce((s, d) => s + (num(d.totalCost) ?? 0), 0),
  );
  const maintenanceCost = round2(
    jobCards.reduce((s, j) => s + (num(j.totalCost) ?? 0), 0),
  );

  const capital = num(machine.capitalisationCost);
  const deprRate = num(machine.deprRate);
  const depreciation = annualDepreciation(capital, deprRate);
  const operatorCost = round2(operatorDays.size * OPERATOR_DAY_RATE);
  const hireCostAmount = hireCost;
  const rentOutRevenueAmount = rentOutRevenue;

  const lines = [
    {
      key: "depreciation",
      label: "Depreciation (annual)",
      subtext:
        capital && deprRate
          ? `${deprRate}% on ₹${capital.toLocaleString("en-IN")}`
          : "— @ 0% on ₹0",
      amount: depreciation,
    },
    {
      key: "fuel",
      label: "Fuel",
      subtext: "Diesel Log issues (existing valuation)",
      amount: fuelCost,
    },
    {
      key: "maintenance",
      label: "Maintenance",
      subtext: "Approved job cards (spares + service + labour)",
      amount: maintenanceCost,
    },
    {
      key: "operator",
      label: "Operator",
      subtext: `${operatorDays.size} operator-day(s) · rate from HR (placeholder)`,
      amount: operatorCost,
    },
    {
      key: "hire",
      label: "Hire cost",
      subtext: "Approved hire-in verification sheets",
      amount: hireCostAmount,
    },
    {
      key: "rent_out",
      label: "Less: Rent-out revenue",
      subtext: "Approved rent-out bills",
      amount: rentOutRevenueAmount,
      isCredit: true,
    },
  ];

  const netMachineCost = round2(
    depreciation + fuelCost + maintenanceCost + operatorCost + hireCostAmount - rentOutRevenueAmount,
  );

  return {
    equipmentId: machine.id,
    equipmentCode: machine.code,
    equipmentName: machine.name,
    equipmentType: machine.type,
    ownershipType: ownershipLabel(machine.ownershipType),
    run: round2(run),
    operatorDays: operatorDays.size,
    lines,
    netMachineCost,
  };
}
