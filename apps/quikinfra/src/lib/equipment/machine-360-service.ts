/**
 * Machine 360 — per-machine analytics, charts, and timeline.
 */

import { db } from "@/lib/db";
import { deriveDocComplianceState } from "@/lib/equipment/equipment-calculations";
import {
  DEPLOY_DOCUMENT,
  DEPLOY_TRANSFER,
} from "@/lib/equipment/equipment-record-types";
import { getCostSheet } from "@/lib/equipment/fleet-service";
import {
  listHireInVerifications,
  listRentOutBills,
} from "@/lib/equipment/hire-rent-service";
import type {
  Machine360CostBurnPoint,
  Machine360MonthlyPoint,
  Machine360Payload,
  Machine360TimelineEvent,
} from "@/lib/equipment/equipment-types";

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

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
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

export async function getMachine360(opts: {
  orgId: string;
  equipmentId: string;
  fromDate?: string;
  toDate?: string;
}): Promise<Machine360Payload> {
  const machine = await db.cnMachinery.findFirst({
    where: { id: opts.equipmentId, orgId: opts.orgId },
    include: { project: { select: { name: true } } },
  });
  if (!machine) throw new Error("EQUIPMENT_NOT_FOUND");

  const logDateFilter = dateRangeWhere(opts.fromDate, opts.toDate);
  const jobDateFilter = dateRangeWhere(opts.fromDate, opts.toDate);
  const dieselDateFilter = dateRangeWhere(opts.fromDate, opts.toDate);

  const logWhere = {
    orgId: opts.orgId,
    equipmentId: opts.equipmentId,
    ...(logDateFilter ? { logDate: logDateFilter } : {}),
  };

  const [
    logs,
    dieselLogs,
    jobCards,
    lifetimeJobs,
    transfers,
    documents,
    costSheet,
    hireInList,
    rentOutList,
  ] = await Promise.all([
    db.cnEquipmentLog.findMany({
      where: logWhere,
      orderBy: { logDate: "asc" },
      select: {
        id: true,
        logDate: true,
        shift: true,
        run: true,
        idleHours: true,
        breakdownHours: true,
        closingMeter: true,
        dieselIssued: true,
        fuelRate: true,
        status: true,
      },
    }),
    db.cnDieselLog.findMany({
      where: {
        orgId: opts.orgId,
        machineryId: opts.equipmentId,
        ...(dieselDateFilter ? { logDate: dieselDateFilter } : {}),
      },
      select: { logDate: true, totalCost: true, quantityIssued: true },
    }),
    db.cnMaintenanceJobCard.findMany({
      where: {
        orgId: opts.orgId,
        equipmentId: opts.equipmentId,
        ...(jobDateFilter ? { serviceDate: jobDateFilter } : {}),
      },
      orderBy: { serviceDate: "desc" },
      select: {
        id: true,
        jobNumber: true,
        jobType: true,
        serviceDate: true,
        totalCost: true,
        status: true,
        downtimeHours: true,
      },
    }),
    db.cnMaintenanceJobCard.findMany({
      where: {
        orgId: opts.orgId,
        equipmentId: opts.equipmentId,
        status: { not: "cancelled" },
      },
      select: { totalCost: true, status: true },
    }),
    db.cnEquipmentDeployment.findMany({
      where: {
        orgId: opts.orgId,
        equipmentId: opts.equipmentId,
        recordType: DEPLOY_TRANSFER,
        ...(logDateFilter ? { transferDate: logDateFilter } : {}),
      },
      orderBy: { transferDate: "desc" },
      select: {
        id: true,
        referenceNumber: true,
        transferDate: true,
        status: true,
        transferType: true,
        destinationProject: { select: { name: true } },
      },
    }),
    db.cnEquipmentDeployment.findMany({
      where: {
        orgId: opts.orgId,
        equipmentId: opts.equipmentId,
        recordType: DEPLOY_DOCUMENT,
        status: "active",
      },
      select: {
        id: true,
        docType: true,
        docNumber: true,
        expiryDate: true,
        alertDays: true,
        issueDate: true,
      },
    }),
    getCostSheet({
      orgId: opts.orgId,
      equipmentId: opts.equipmentId,
      fromDate: opts.fromDate,
      toDate: opts.toDate,
    }),
    listHireInVerifications({ orgId: opts.orgId }),
    listRentOutBills({ orgId: opts.orgId }),
  ]);

  const approvedLogs = logs.filter((l) => l.status === "approved");
  let run = 0;
  let breakdownHours = 0;
  let fuelLitres = 0;
  let fuelRateSum = 0;
  let fuelRateCount = 0;

  const meterSeries: { date: string; value: number }[] = [];
  for (const l of approvedLogs) {
    run += num(l.run) ?? 0;
    breakdownHours += num(l.breakdownHours) ?? 0;
    fuelLitres += num(l.dieselIssued) ?? 0;
    const fr = num(l.fuelRate);
    if (fr != null) {
      fuelRateSum += fr;
      fuelRateCount += 1;
    }
    const closing = num(l.closingMeter);
    if (closing != null) {
      meterSeries.push({
        date: l.logDate.toISOString().slice(0, 10),
        value: closing,
      });
    }
  }

  const fuelCost = round2(
    dieselLogs.reduce((s, d) => s + (num(d.totalCost) ?? 0), 0),
  );
  const maintenanceCost = round2(
    jobCards
      .filter((j) => j.status !== "cancelled")
      .reduce((s, j) => s + (num(j.totalCost) ?? 0), 0),
  );
  const maintenanceLifetime = round2(
    lifetimeJobs.reduce((s, j) => s + (num(j.totalCost) ?? 0), 0),
  );
  const openJobCards = lifetimeJobs.filter((j) => j.status === "open").length;

  const avgFuelRate =
    fuelRateCount > 0 ? round4(fuelRateSum / fuelRateCount) : run > 0 && fuelLitres > 0 ? round4(fuelLitres / run) : null;

  const fuelNorm = num(machine.fuelNorm);
  const fuelSeries = approvedLogs
    .filter((l) => num(l.fuelRate) != null || (num(l.dieselIssued) ?? 0) > 0)
    .map((l) => {
      const lpu =
        num(l.fuelRate) ??
        (num(l.run) && num(l.run)! > 0 && num(l.dieselIssued)
          ? round4(num(l.dieselIssued)! / num(l.run)!)
          : 0);
      const anomaly =
        fuelNorm != null && fuelNorm > 0 ? lpu > fuelNorm * 1.1 : false;
      return {
        date: l.logDate.toISOString().slice(0, 10),
        value: lpu,
        anomaly,
      };
    });

  const monthlyMap = new Map<string, { run: number; idle: number; breakdown: number }>();
  for (const l of approvedLogs) {
    const mk = monthKey(l.logDate);
    const cur = monthlyMap.get(mk) ?? { run: 0, idle: 0, breakdown: 0 };
    cur.run += num(l.run) ?? 0;
    cur.idle += num(l.idleHours) ?? 0;
    cur.breakdown += num(l.breakdownHours) ?? 0;
    monthlyMap.set(mk, cur);
  }
  const monthly: Machine360MonthlyPoint[] = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      run: round2(v.run),
      idle: round2(v.idle),
      breakdown: round2(v.breakdown),
    }));

  const fuelByMonth = new Map<string, number>();
  for (const d of dieselLogs) {
    const mk = monthKey(d.logDate);
    fuelByMonth.set(mk, (fuelByMonth.get(mk) ?? 0) + (num(d.totalCost) ?? 0));
  }
  const maintByMonth = new Map<string, number>();
  for (const j of jobCards.filter((x) => x.status !== "cancelled")) {
    const mk = monthKey(j.serviceDate);
    maintByMonth.set(mk, (maintByMonth.get(mk) ?? 0) + (num(j.totalCost) ?? 0));
  }
  const allMonths = new Set([...fuelByMonth.keys(), ...maintByMonth.keys()]);
  const costBurn: Machine360CostBurnPoint[] = [...allMonths]
    .sort()
    .map((month) => ({
      month,
      fuel: round2(fuelByMonth.get(month) ?? 0),
      maintenance: round2(maintByMonth.get(month) ?? 0),
    }));

  let complianceState: "valid" | "expired" | "expiring" = "valid";
  for (const doc of documents) {
    const state = deriveDocComplianceState(
      doc.expiryDate?.toISOString?.().slice(0, 10) ?? null,
      doc.alertDays,
    );
    if (state === "expired") {
      complianceState = "expired";
      break;
    }
    if (state === "expiring") complianceState = "expiring";
  }

  const timeline: Machine360TimelineEvent[] = [];

  for (const l of logs) {
    timeline.push({
      date: l.logDate.toISOString().slice(0, 10),
      kind: "log",
      title: `Log · ${l.shift}`,
      summary: `Run ${num(l.run) ?? 0} · ${l.status}`,
      amount: null,
      status: l.status,
      flag: num(l.fuelRate) != null && fuelNorm != null && fuelNorm > 0
        ? num(l.fuelRate)! > fuelNorm * 1.1
        : null,
      refNumber: null,
    });
  }
  for (const j of jobCards) {
    timeline.push({
      date: j.serviceDate.toISOString().slice(0, 10),
      kind: "maintenance",
      title: `${j.jobType} · ${j.jobNumber}`,
      summary: j.status,
      amount: num(j.totalCost),
      status: j.status,
      flag: null,
      refNumber: j.jobNumber,
    });
  }
  for (const t of transfers) {
    timeline.push({
      date: t.transferDate.toISOString().slice(0, 10),
      kind: "movement",
      title: `Transfer · ${t.transferType}`,
      summary: `→ ${t.destinationProject.name} · ${t.status}`,
      amount: null,
      status: t.status,
      flag: null,
      refNumber: t.referenceNumber ?? t.id,
    });
  }
  for (const doc of documents) {
    const state = deriveDocComplianceState(
      doc.expiryDate?.toISOString?.().slice(0, 10) ?? null,
      doc.alertDays,
    );
    timeline.push({
      date: doc.issueDate?.toISOString?.().slice(0, 10) ?? doc.expiryDate?.toISOString?.().slice(0, 10) ?? "",
      kind: "compliance",
      title: doc.docType,
      summary: doc.docNumber ?? "—",
      amount: null,
      status: state,
      flag: state !== "ok",
      refNumber: doc.docNumber,
    });
  }

  timeline.sort((a, b) => b.date.localeCompare(a.date));

  const hireInForMachine = hireInList.data.filter((v) => v.equipmentId === opts.equipmentId);
  const rentOutForMachine = rentOutList.data.filter((b) => b.equipmentId === opts.equipmentId);

  const logCount = logs.length;
  const maintCount = jobCards.length;
  const movementCount = transfers.length;
  const complianceCount = documents.length;

  return {
    header: {
      id: machine.id,
      code: machine.code,
      name: machine.name,
      type: machine.type,
      ownershipType: ownershipLabel(machine.ownershipType),
      projectId: machine.projectId,
      projectName: machine.project?.name ?? null,
      meterType: machine.meterType ?? "hour",
      currentMeter: num(machine.currentMeter),
      fuelNorm: num(machine.fuelNorm),
      status: machine.status,
    },
    kpis: {
      run: round2(run),
      runSubtext: logCount === 0 ? "no logs" : `${approvedLogs.length} approved log(s)`,
      breakdownHours: round2(breakdownHours),
      fuelLitres: round2(fuelLitres),
      fuelRate: avgFuelRate,
      fuelCost,
      maintenanceCost,
      maintenanceLifetime,
      openJobCards,
      netMachineCost: costSheet.netMachineCost,
      rentOutRevenue: costSheet.lines.find((l) => l.key === "rent_out")?.amount ?? 0,
      complianceState,
      openJobCardsCompliance: openJobCards,
    },
    costSheet,
    charts: {
      meterSeries,
      monthly,
      fuelSeries,
      costBurn,
    },
    timeline,
    counts: {
      logs: logCount,
      maintenance: maintCount,
      movement: movementCount,
      compliance: complianceCount,
      commercials: hireInForMachine.length + rentOutForMachine.length,
    },
  };
}
