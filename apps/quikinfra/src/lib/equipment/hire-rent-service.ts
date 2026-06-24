/**
 * Hire & Rent — rate master, hire-in verification, rent-out billing.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import {
  computeBillableQty,
  computeHireRentAmounts,
  computeVarianceQty,
} from "@/lib/equipment/equipment-calculations";
import {
  HIRE_IN,
  HIRE_RATE,
  RENT_OUT,
} from "@/lib/equipment/equipment-record-types";
import type {
  HireInVerificationRecord,
  HireRateBasis,
  HireRateDirection,
  HireRateRecord,
  HireRentSummary,
  RentOutBillRecord,
} from "@/lib/equipment/equipment-types";

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseDate(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("INVALID_DATE");
  return d;
}

function scopeLabel(
  equipmentType: string | null | undefined,
  equipmentName: string | null | undefined,
  equipmentCode: string | null | undefined,
): string {
  // When the rate is scoped to a specific machine, show that machine's
  // identity (code — name); only fall back to the generic equipment type
  // for type-scoped rates, then to a dash.
  const code = equipmentCode?.trim();
  const name = equipmentName?.trim();
  if (code || name) {
    return [code, name].filter(Boolean).join(" — ");
  }
  const type = equipmentType?.trim();
  return type || "—";
}

async function nextVerificationNumber(orgId: string): Promise<string> {
  const count = await db.cnHireRentRecord.count({
    where: { orgId, recordType: HIRE_IN },
  });
  return `HIV-${String(count + 1).padStart(4, "0")}`;
}

async function nextBillNumber(orgId: string): Promise<string> {
  const count = await db.cnHireRentRecord.count({
    where: { orgId, recordType: RENT_OUT },
  });
  return `RENT-${String(count + 1).padStart(4, "0")}`;
}

export async function computeLoggedQty(opts: {
  orgId: string;
  equipmentId: string;
  periodFrom: Date;
  periodTo: Date;
  rateBasis: string;
}): Promise<number> {
  const logs = await db.cnEquipmentLog.findMany({
    where: {
      orgId: opts.orgId,
      equipmentId: opts.equipmentId,
      status: "approved",
      logDate: { gte: opts.periodFrom, lte: opts.periodTo },
    },
    select: { logDate: true, run: true },
  });

  if (opts.rateBasis === "day") {
    const days = new Set(
      logs
        .filter((l) => (num(l.run) ?? 0) > 0)
        .map((l) => l.logDate.toISOString().slice(0, 10)),
    );
    return days.size;
  }

  if (opts.rateBasis === "month") {
    const months = new Set(
      logs
        .filter((l) => (num(l.run) ?? 0) > 0)
        .map((l) => l.logDate.toISOString().slice(0, 7)),
    );
    return months.size;
  }

  return round2(logs.reduce((s, l) => s + (num(l.run) ?? 0), 0));
}

const hireRateInclude = {
  equipment: { select: { code: true, name: true, type: true } },
  vendor: { select: { name: true } },
  customer: { select: { name: true } },
} as const;

function toHireRateRecord(
  row: Prisma.CnHireRentRecordGetPayload<{ include: typeof hireRateInclude }>,
): HireRateRecord {
  const eqType = row.equipment?.type ?? row.equipmentType;
  return {
    id: row.id,
    orgId: row.orgId,
    direction: (row.direction ?? "hire_in") as HireRateDirection,
    rateBasis: (row.rateBasis ?? "hour") as HireRateBasis,
    equipmentId: row.equipmentId,
    equipmentCode: row.equipment?.code ?? null,
    equipmentName: row.equipment?.name ?? null,
    equipmentType: eqType ?? null,
    scopeLabel: scopeLabel(eqType, row.equipment?.name, row.equipment?.code),
    vendorId: row.vendorId,
    vendorName: row.vendor?.name ?? null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    rate: num(row.rate) ?? 0,
    sacCode: row.sacCode,
    gstPercent: num(row.gstPercent) ?? 18,
    minGuaranteedQty: num(row.minGuaranteedQty),
    effectiveFrom: row.effectiveFrom?.toISOString?.().slice(0, 10) ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const verificationInclude = {
  equipment: { select: { code: true, name: true } },
  vendor: { select: { name: true } },
} as const;

function toVerificationRecord(
  row: Prisma.CnHireRentRecordGetPayload<{ include: typeof verificationInclude }>,
): HireInVerificationRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    verificationNumber: row.referenceNumber ?? row.id,
    equipmentId: row.equipmentId ?? "",
    equipmentCode: row.equipment?.code ?? "",
    equipmentName: row.equipment?.name ?? "",
    vendorId: row.vendorId,
    vendorName: row.vendor?.name ?? null,
    projectId: row.projectId,
    periodFrom: row.periodFrom!.toISOString().slice(0, 10),
    periodTo: row.periodTo!.toISOString().slice(0, 10),
    rate: num(row.rate) ?? 0,
    rateBasis: (row.rateBasis ?? "hour") as HireRateBasis,
    vendorClaimedQty: num(row.vendorClaimedQty),
    minGuaranteedQty: num(row.minGuaranteedQty),
    gstPercent: num(row.gstPercent) ?? 18,
    loggedQty: num(row.loggedQty),
    billableQty: num(row.billableQty),
    varianceQty: num(row.varianceQty),
    payableAmount: num(row.payableAmount),
    gstAmount: num(row.gstAmount),
    totalAmount: num(row.totalAmount),
    status: row.status,
    approvalId: row.approvalId,
    rejectReason: row.rejectReason,
    returnReason: row.returnReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

const billInclude = {
  equipment: { select: { code: true, name: true } },
  customer: { select: { name: true } },
  project: { select: { name: true } },
} as const;

function toBillRecord(
  row: Prisma.CnHireRentRecordGetPayload<{ include: typeof billInclude }>,
): RentOutBillRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    billNumber: row.referenceNumber ?? row.id,
    equipmentId: row.equipmentId ?? "",
    equipmentCode: row.equipment?.code ?? "",
    equipmentName: row.equipment?.name ?? "",
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    periodFrom: row.periodFrom!.toISOString().slice(0, 10),
    periodTo: row.periodTo!.toISOString().slice(0, 10),
    rateBasis: (row.rateBasis ?? "hour") as HireRateBasis,
    rate: num(row.rate) ?? 0,
    minGuaranteedQty: num(row.minGuaranteedQty),
    sacCode: row.sacCode,
    gstPercent: num(row.gstPercent) ?? 18,
    billableQty: num(row.billableQty),
    amount: num(row.amount),
    gstAmount: num(row.gstAmount),
    totalAmount: num(row.totalAmount),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getHireRentSummary(opts: { orgId: string }): Promise<HireRentSummary> {
  const [hireRates, verifications, bills] = await Promise.all([
    db.cnHireRentRecord.count({
      where: { orgId: opts.orgId, recordType: HIRE_RATE, status: "active" },
    }),
    db.cnHireRentRecord.findMany({
      where: { orgId: opts.orgId, recordType: HIRE_IN, status: "approved" },
      select: { totalAmount: true },
    }),
    db.cnHireRentRecord.findMany({
      where: { orgId: opts.orgId, recordType: RENT_OUT, status: "approved" },
      select: { totalAmount: true },
    }),
  ]);

  return {
    hireRates,
    hireInPayable: round2(
      verifications.reduce((s, v) => s + (num(v.totalAmount) ?? 0), 0),
    ),
    rentOutRevenue: round2(
      bills.reduce((s, b) => s + (num(b.totalAmount) ?? 0), 0),
    ),
    rentBills: bills.length,
  };
}

export async function listHireRates(opts: {
  orgId: string;
  direction?: string;
}) {
  const where: Prisma.CnHireRentRecordWhereInput = {
    orgId: opts.orgId,
    recordType: HIRE_RATE,
    status: { not: "inactive" },
  };
  if (opts.direction && opts.direction !== "all") {
    where.direction = opts.direction;
  }

  const rows = await db.cnHireRentRecord.findMany({
    where,
    include: hireRateInclude,
    orderBy: { createdAt: "desc" },
  });

  return {
    data: rows.map(toHireRateRecord),
    total: rows.length,
  };
}

export interface CreateHireRateInput {
  orgId: string;
  userId: string;
  direction: HireRateDirection;
  rateBasis?: HireRateBasis;
  equipmentId?: string | null;
  equipmentType?: string | null;
  vendorId?: string | null;
  customerId?: string | null;
  rate: number;
  sacCode?: string | null;
  gstPercent?: number;
  minGuaranteedQty?: number | null;
  effectiveFrom?: string | null;
}

export async function createHireRate(input: CreateHireRateInput) {
  if (input.rate <= 0) throw new Error("INVALID_RATE");

  const row = await db.cnHireRentRecord.create({
    data: {
      orgId: input.orgId,
      recordType: HIRE_RATE,
      direction: input.direction,
      rateBasis: input.rateBasis ?? "hour",
      equipmentId: input.equipmentId ?? null,
      equipmentType: input.equipmentType ?? null,
      vendorId: input.vendorId ?? null,
      customerId: input.customerId ?? null,
      rate: input.rate,
      sacCode: input.sacCode ?? "995463",
      gstPercent: input.gstPercent ?? 18,
      minGuaranteedQty: input.minGuaranteedQty ?? null,
      effectiveFrom: input.effectiveFrom ? parseDate(input.effectiveFrom) : null,
      status: "active",
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: hireRateInclude,
  });

  return toHireRateRecord(row);
}

export async function listHireInVerifications(opts: { orgId: string }) {
  const rows = await db.cnHireRentRecord.findMany({
    where: { orgId: opts.orgId, recordType: HIRE_IN },
    include: verificationInclude,
    orderBy: { periodFrom: "desc" },
  });
  return { data: rows.map(toVerificationRecord), total: rows.length };
}

export interface CreateHireInVerificationInput {
  orgId: string;
  userId: string;
  equipmentId: string;
  vendorId?: string | null;
  projectId?: string | null;
  periodFrom: string;
  periodTo: string;
  rate: number;
  rateBasis?: HireRateBasis;
  vendorClaimedQty?: number | null;
  minGuaranteedQty?: number | null;
  gstPercent?: number;
  compute?: boolean;
}

export async function createHireInVerification(input: CreateHireInVerificationInput) {
  const equipment = await db.cnMachinery.findFirst({
    where: { id: input.equipmentId, orgId: input.orgId },
    select: { id: true },
  });
  if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");

  const periodFrom = parseDate(input.periodFrom);
  const periodTo = parseDate(input.periodTo);
  if (periodTo < periodFrom) throw new Error("INVALID_PERIOD");

  const rateBasis = input.rateBasis ?? "hour";
  const gstPercent = input.gstPercent ?? 18;
  const verificationNumber = await nextVerificationNumber(input.orgId);

  let loggedQty: number | null = null;
  let billableQty: number | null = null;
  let varianceQty: number | null = null;
  let payableAmount: number | null = null;
  let gstAmount: number | null = null;
  let totalAmount: number | null = null;
  let status = "draft";

  if (input.compute !== false) {
    loggedQty = await computeLoggedQty({
      orgId: input.orgId,
      equipmentId: input.equipmentId,
      periodFrom,
      periodTo,
      rateBasis,
    });
    billableQty = computeBillableQty(loggedQty, input.minGuaranteedQty ?? null);
    varianceQty = computeVarianceQty(input.vendorClaimedQty ?? null, loggedQty);
    const amounts = computeHireRentAmounts(billableQty, input.rate, gstPercent);
    payableAmount = amounts.payable;
    gstAmount = amounts.gstAmount;
    totalAmount = amounts.total;
    status = "computed";
  }

  const row = await db.cnHireRentRecord.create({
    data: {
      orgId: input.orgId,
      recordType: HIRE_IN,
      referenceNumber: verificationNumber,
      equipmentId: input.equipmentId,
      vendorId: input.vendorId ?? null,
      projectId: input.projectId ?? null,
      periodFrom,
      periodTo,
      rate: input.rate,
      rateBasis,
      vendorClaimedQty: input.vendorClaimedQty ?? null,
      minGuaranteedQty: input.minGuaranteedQty ?? null,
      gstPercent,
      loggedQty,
      billableQty,
      varianceQty,
      payableAmount,
      gstAmount,
      totalAmount,
      status,
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: verificationInclude,
  });

  return toVerificationRecord(row);
}

export async function patchHireInVerification(opts: {
  orgId: string;
  userId: string;
  id: string;
  action: "approve" | "recompute";
}) {
  const existing = await db.cnHireRentRecord.findFirst({
    where: { id: opts.id, orgId: opts.orgId, recordType: HIRE_IN },
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (opts.action === "approve") {
    const row = await db.cnHireRentRecord.update({
      where: { id: opts.id },
      data: { status: "approved", updatedBy: opts.userId },
      include: verificationInclude,
    });
    return toVerificationRecord(row);
  }

  const loggedQty = await computeLoggedQty({
    orgId: opts.orgId,
    equipmentId: existing.equipmentId,
    periodFrom: existing.periodFrom,
    periodTo: existing.periodTo,
    rateBasis: existing.rateBasis,
  });
  const billableQty = computeBillableQty(
    loggedQty,
    num(existing.minGuaranteedQty),
  );
  const varianceQty = computeVarianceQty(
    num(existing.vendorClaimedQty),
    loggedQty,
  );
  const amounts = computeHireRentAmounts(
    billableQty,
    num(existing.rate) ?? 0,
    num(existing.gstPercent) ?? 18,
  );

  const row = await db.cnHireRentRecord.update({
    where: { id: opts.id },
    data: {
      loggedQty,
      billableQty,
      varianceQty,
      payableAmount: amounts.payable,
      gstAmount: amounts.gstAmount,
      totalAmount: amounts.total,
      status: "computed",
      updatedBy: opts.userId,
    },
    include: verificationInclude,
  });
  return toVerificationRecord(row);
}

export async function getHireInVerificationById(orgId: string, id: string) {
  const row = await db.cnHireRentRecord.findFirst({
    where: { id, orgId, recordType: HIRE_IN },
    include: verificationInclude,
  });
  return row ? toVerificationRecord(row) : null;
}

/** Raw row used by the workflow routes (needs projectId / approvalId / number). */
export async function findHireInVerificationRow(orgId: string, id: string) {
  return db.cnHireRentRecord.findFirst({
    where: { id, orgId, recordType: HIRE_IN },
  });
}

export function formatHireInVerificationEntityNumber(row: {
  referenceNumber: string | null;
  id: string;
}): string {
  return row.referenceNumber ?? row.id;
}

export async function patchHireInVerificationWorkflowStatus(
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
  const updated = await db.cnHireRentRecord.update({
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
    include: verificationInclude,
  });
  if (updated.orgId !== orgId) throw new Error("NOT_FOUND");
  return toVerificationRecord(updated);
}

export async function listRentOutBills(opts: { orgId: string }) {
  const rows = await db.cnHireRentRecord.findMany({
    where: { orgId: opts.orgId, recordType: RENT_OUT },
    include: billInclude,
    orderBy: { periodFrom: "desc" },
  });
  return { data: rows.map(toBillRecord), total: rows.length };
}

export interface CreateRentOutBillInput {
  orgId: string;
  userId: string;
  equipmentId: string;
  customerId?: string | null;
  projectId?: string | null;
  periodFrom: string;
  periodTo: string;
  rateBasis?: HireRateBasis;
  rate: number;
  minGuaranteedQty?: number | null;
  sacCode?: string | null;
  gstPercent?: number;
  generate?: boolean;
}

export async function createRentOutBill(input: CreateRentOutBillInput) {
  const equipment = await db.cnMachinery.findFirst({
    where: { id: input.equipmentId, orgId: input.orgId },
    select: { id: true },
  });
  if (!equipment) throw new Error("EQUIPMENT_NOT_FOUND");

  const periodFrom = parseDate(input.periodFrom);
  const periodTo = parseDate(input.periodTo);
  if (periodTo < periodFrom) throw new Error("INVALID_PERIOD");

  const rateBasis = input.rateBasis ?? "hour";
  const gstPercent = input.gstPercent ?? 18;
  const billNumber = await nextBillNumber(input.orgId);

  let billableQty: number | null = null;
  let amount: number | null = null;
  let gstAmount: number | null = null;
  let totalAmount: number | null = null;
  let status = "draft";

  if (input.generate !== false) {
    const loggedQty = await computeLoggedQty({
      orgId: input.orgId,
      equipmentId: input.equipmentId,
      periodFrom,
      periodTo,
      rateBasis,
    });
    billableQty = computeBillableQty(loggedQty, input.minGuaranteedQty ?? null);
    const amounts = computeHireRentAmounts(billableQty, input.rate, gstPercent);
    amount = amounts.payable;
    gstAmount = amounts.gstAmount;
    totalAmount = amounts.total;
    status = "computed";
  }

  const row = await db.cnHireRentRecord.create({
    data: {
      orgId: input.orgId,
      recordType: RENT_OUT,
      referenceNumber: billNumber,
      equipmentId: input.equipmentId,
      customerId: input.customerId ?? null,
      projectId: input.projectId ?? null,
      periodFrom,
      periodTo,
      rateBasis,
      rate: input.rate,
      minGuaranteedQty: input.minGuaranteedQty ?? null,
      sacCode: input.sacCode ?? "995463",
      gstPercent,
      billableQty,
      amount,
      gstAmount,
      totalAmount,
      status,
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: billInclude,
  });

  return toBillRecord(row);
}

export async function patchRentOutBill(opts: {
  orgId: string;
  userId: string;
  id: string;
  action: "approve" | "regenerate";
}) {
  const existing = await db.cnHireRentRecord.findFirst({
    where: { id: opts.id, orgId: opts.orgId, recordType: RENT_OUT },
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (opts.action === "approve") {
    const row = await db.cnHireRentRecord.update({
      where: { id: opts.id },
      data: { status: "approved", updatedBy: opts.userId },
      include: billInclude,
    });
    return toBillRecord(row);
  }

  const loggedQty = await computeLoggedQty({
    orgId: opts.orgId,
    equipmentId: existing.equipmentId,
    periodFrom: existing.periodFrom,
    periodTo: existing.periodTo,
    rateBasis: existing.rateBasis,
  });
  const billableQty = computeBillableQty(
    loggedQty,
    num(existing.minGuaranteedQty),
  );
  const amounts = computeHireRentAmounts(
    billableQty,
    num(existing.rate) ?? 0,
    num(existing.gstPercent) ?? 18,
  );

  const row = await db.cnHireRentRecord.update({
    where: { id: opts.id },
    data: {
      billableQty,
      amount: amounts.payable,
      gstAmount: amounts.gstAmount,
      totalAmount: amounts.total,
      status: "computed",
      updatedBy: opts.userId,
    },
    include: billInclude,
  });
  return toBillRecord(row);
}

export async function sumApprovedHireInForEquipment(opts: {
  orgId: string;
  equipmentId: string;
  fromDate?: Date;
  toDate?: Date;
}): Promise<number> {
  const where: Prisma.CnHireRentRecordWhereInput = {
    orgId: opts.orgId,
    recordType: HIRE_IN,
    equipmentId: opts.equipmentId,
    status: "approved",
  };
  if (opts.fromDate || opts.toDate) {
    where.periodFrom = {
      ...(opts.fromDate ? { gte: opts.fromDate } : {}),
      ...(opts.toDate ? { lte: opts.toDate } : {}),
    };
  }
  const rows = await db.cnHireRentRecord.findMany({
    where,
    select: { totalAmount: true },
  });
  return round2(rows.reduce((s, r) => s + (num(r.totalAmount) ?? 0), 0));
}

export async function sumApprovedRentOutForEquipment(opts: {
  orgId: string;
  equipmentId: string;
  fromDate?: Date;
  toDate?: Date;
}): Promise<number> {
  const where: Prisma.CnHireRentRecordWhereInput = {
    orgId: opts.orgId,
    recordType: RENT_OUT,
    equipmentId: opts.equipmentId,
    status: "approved",
  };
  if (opts.fromDate || opts.toDate) {
    where.periodFrom = {
      ...(opts.fromDate ? { gte: opts.fromDate } : {}),
      ...(opts.toDate ? { lte: opts.toDate } : {}),
    };
  }
  const rows = await db.cnHireRentRecord.findMany({
    where,
    select: { totalAmount: true },
  });
  return round2(rows.reduce((s, r) => s + (num(r.totalAmount) ?? 0), 0));
}
