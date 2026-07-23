/**
 * Fixed Asset / Tools — issuance, transfers, repairs, audits, depreciation.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import {
  computeAnnualDepreciation,
  computeAuditVariance,
  computeAvailableQty,
  computeBookValue,
} from "@/lib/equipment/fixed-assets-calculations";
import type {
  FixedAssetAuditRecord,
  FixedAssetDashboardPayload,
  FixedAssetDepreciationRow,
  FixedAssetIssuanceRecord,
  FixedAssetQtyState,
  FixedAssetRepairRecord,
  FixedAssetTransferRecord,
} from "@/lib/equipment/fixed-assets-types";
import {
  FA_AUDIT,
  FA_ISSUANCE,
  FA_REPAIR,
  FA_TRANSFER,
} from "@/lib/equipment/equipment-record-types";

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

function parseDate(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("INVALID_DATE");
  return d;
}

async function nextNumber(
  orgId: string,
  model: "issuance" | "transfer" | "repair" | "audit",
): Promise<string> {
  const typeMap = {
    issuance: FA_ISSUANCE,
    transfer: FA_TRANSFER,
    repair: FA_REPAIR,
    audit: FA_AUDIT,
  } as const;
  const prefixMap = {
    issuance: "ASI",
    transfer: "ATR",
    repair: "ARP",
    audit: "AUD",
  } as const;
  const recordType = typeMap[model];
  const c = await db.cnFixedAssetTransaction.count({
    where: { orgId, recordType },
  });
  return `${prefixMap[model]}-${String(c + 1).padStart(4, "0")}`;
}

export async function getAssetQtyState(
  orgId: string,
  assetId: string,
): Promise<FixedAssetQtyState> {
  const asset = await db.cnAsset.findFirst({
    where: { id: assetId, orgId },
    select: { currentStock: true, lostQty: true },
  });
  if (!asset) throw new Error("ASSET_NOT_FOUND");

  const [issuedAgg, repairAgg, transitAgg] = await Promise.all([
    db.cnFixedAssetTransaction.aggregate({
      where: { orgId, assetId, recordType: FA_ISSUANCE, status: { in: ["issued", "partial"] } },
      _sum: { pendingQty: true },
    }),
    db.cnFixedAssetTransaction.aggregate({
      where: { orgId, assetId, recordType: FA_REPAIR, status: "open" },
      _sum: { quantity: true },
    }),
    db.cnFixedAssetTransaction.aggregate({
      where: { orgId, assetId, recordType: FA_TRANSFER, status: "in_transit" },
      _sum: { quantity: true },
    }),
  ]);

  const total = num(asset.currentStock) ?? 0;
  const issued = num(issuedAgg._sum.pendingQty) ?? 0;
  const underRepair = num(repairAgg._sum.quantity) ?? 0;
  const inTransit = num(transitAgg._sum.quantity) ?? 0;
  const lost = num(asset.lostQty) ?? 0;
  const available = computeAvailableQty(total, issued, underRepair, inTransit, lost);

  return {
    total: round4(total),
    issued: round4(issued),
    underRepair: round4(underRepair),
    inTransit: round4(inTransit),
    lost: round4(lost),
    available: round4(available),
  };
}

export async function getFixedAssetDashboard(opts: {
  orgId: string;
}): Promise<FixedAssetDashboardPayload> {
  const assets = await db.cnAsset.findMany({
    where: { orgId: opts.orgId, status: { not: "Disposed" } },
    select: {
      id: true,
      category: true,
      purchaseValue: true,
      accumulatedDepr: true,
      currentStock: true,
      lostQty: true,
    },
  });

  const assetIds = assets.map((a) => a.id);
  const [issuedRows, repairRows, transitRows] = await Promise.all([
    assetIds.length
      ? db.cnFixedAssetTransaction.groupBy({
          by: ["assetId"],
          where: { orgId: opts.orgId, assetId: { in: assetIds }, recordType: FA_ISSUANCE, status: { in: ["issued", "partial"] } },
          _sum: { pendingQty: true },
        })
      : [],
    assetIds.length
      ? db.cnFixedAssetTransaction.groupBy({
          by: ["assetId"],
          where: { orgId: opts.orgId, assetId: { in: assetIds }, recordType: FA_REPAIR, status: "open" },
          _sum: { quantity: true },
        })
      : [],
    assetIds.length
      ? db.cnFixedAssetTransaction.groupBy({
          by: ["assetId"],
          where: { orgId: opts.orgId, assetId: { in: assetIds }, recordType: FA_TRANSFER, status: "in_transit" },
          _sum: { quantity: true },
        })
      : [],
  ]);

  const issuedMap = new Map(issuedRows.map((r) => [r.assetId, num(r._sum.pendingQty) ?? 0]));
  const repairMap = new Map(repairRows.map((r) => [r.assetId, num(r._sum.quantity) ?? 0]));
  const transitMap = new Map(transitRows.map((r) => [r.assetId, num(r._sum.quantity) ?? 0]));

  let available = 0;
  let issued = 0;
  let underRepair = 0;
  let lost = 0;
  let bookValue = 0;
  const categoryMap = new Map<string, { assets: number; bookValue: number }>();

  for (const a of assets) {
    const total = num(a.currentStock) ?? 0;
    const i = issuedMap.get(a.id) ?? 0;
    const r = repairMap.get(a.id) ?? 0;
    const t = transitMap.get(a.id) ?? 0;
    const l = num(a.lostQty) ?? 0;
    available += computeAvailableQty(total, i, r, t, l);
    issued += i;
    underRepair += r;
    lost += l;

    const bv = computeBookValue(num(a.purchaseValue), num(a.accumulatedDepr));
    bookValue += bv;

    const cat = a.category?.trim() || "Uncategorized";
    const cur = categoryMap.get(cat) ?? { assets: 0, bookValue: 0 };
    cur.assets += 1;
    cur.bookValue += bv;
    categoryMap.set(cat, cur);
  }

  return {
    kpis: {
      assets: assets.length,
      available: round4(available),
      issued: round4(issued),
      underRepair: round4(underRepair),
      lost: round4(lost),
      bookValue: round2(bookValue),
    },
    byCategory: [...categoryMap.entries()]
      .map(([category, v]) => ({
        category,
        assets: v.assets,
        bookValue: round2(v.bookValue),
      }))
      .sort((a, b) => a.category.localeCompare(b.category)),
  };
}

const issuanceInclude = {
  asset: { select: { assetCode: true, name: true } },
  project: { select: { name: true } },
} as const;

function toIssuanceRecord(
  row: Prisma.CnFixedAssetTransactionGetPayload<{ include: typeof issuanceInclude }>,
): FixedAssetIssuanceRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    issuanceNumber: row.referenceNumber,
    assetId: row.assetId,
    assetCode: row.asset.assetCode,
    assetName: row.asset.name,
    issuedToType: row.issuedToType ?? "",
    issuedTo: row.issuedTo ?? "",
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    quantity: num(row.quantity) ?? 0,
    pendingQty: num(row.pendingQty) ?? 0,
    gatePassNo: row.gatePassNo,
    expectedReturnDate: row.expectedReturnDate?.toISOString?.().slice(0, 10) ?? null,
    returnable: row.returnable ?? false,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listIssuances(opts: {
  orgId: string;
  search?: string;
  orderBy?: Prisma.CnFixedAssetTransactionOrderByWithRelationInput[];
  take?: number;
  skip?: number;
}) {
  const where: Prisma.CnFixedAssetTransactionWhereInput = {
    orgId: opts.orgId,
    recordType: FA_ISSUANCE,
  };
  const search = opts.search?.trim();
  if (search) {
    where.OR = [
      { referenceNumber: { contains: search, mode: "insensitive" } },
      { gatePassNo: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      { asset: { assetCode: { contains: search, mode: "insensitive" } } },
      { asset: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  const [rows, total] = await Promise.all([
    db.cnFixedAssetTransaction.findMany({
      where,
      include: issuanceInclude,
      orderBy: opts.orderBy ?? [{ createdAt: "desc" }],
      ...(opts.take != null ? { take: opts.take, skip: opts.skip ?? 0 } : {}),
    }),
    db.cnFixedAssetTransaction.count({ where }),
  ]);
  return { data: rows.map(toIssuanceRecord), total };
}

export async function createIssuance(input: {
  orgId: string;
  userId: string;
  assetId: string;
  issuedToType?: string;
  issuedTo: string;
  projectId?: string | null;
  quantity: number;
  returnable?: boolean;
  expectedReturnDate?: string | null;
  notes?: string | null;
}) {
  if (input.quantity <= 0) throw new Error("INVALID_QTY");
  const qtyState = await getAssetQtyState(input.orgId, input.assetId);
  if (input.quantity > qtyState.available) throw new Error("INSUFFICIENT_QTY");

  const issuanceNumber = await nextNumber(input.orgId, "issuance");
  const row = await db.cnFixedAssetTransaction.create({
    data: {
      orgId: input.orgId,
      recordType: FA_ISSUANCE,
      referenceNumber: issuanceNumber,
      assetId: input.assetId,
      issuedToType: input.issuedToType ?? "user",
      issuedTo: input.issuedTo,
      projectId: input.projectId ?? null,
      quantity: input.quantity,
      pendingQty: input.quantity,
      gatePassNo: `GP-${issuanceNumber}`,
      expectedReturnDate: input.expectedReturnDate
        ? parseDate(input.expectedReturnDate)
        : null,
      returnable: input.returnable !== false,
      notes: input.notes ?? null,
      status: "issued",
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: issuanceInclude,
  });
  return toIssuanceRecord(row);
}

export async function returnIssuance(opts: {
  orgId: string;
  userId: string;
  id: string;
  returnQty?: number;
}) {
  const existing = await db.cnFixedAssetTransaction.findFirst({
    where: { id: opts.id, orgId: opts.orgId, recordType: FA_ISSUANCE },
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status === "returned") throw new Error("ALREADY_RETURNED");

  const pending = num(existing.pendingQty) ?? 0;
  const returnQty = opts.returnQty ?? pending;
  const newPending = Math.max(0, pending - returnQty);
  const status = newPending <= 0 ? "returned" : "partial";

  const row = await db.cnFixedAssetTransaction.update({
    where: { id: opts.id },
    data: {
      pendingQty: newPending,
      status,
      updatedBy: opts.userId,
    },
    include: issuanceInclude,
  });
  return toIssuanceRecord(row);
}

const transferInclude = {
  asset: { select: { assetCode: true, name: true } },
  sourceProject: { select: { name: true } },
  destinationProject: { select: { name: true } },
} as const;

function toTransferRecord(
  row: Prisma.CnFixedAssetTransactionGetPayload<{ include: typeof transferInclude }>,
): FixedAssetTransferRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    transferNumber: row.referenceNumber,
    assetId: row.assetId,
    assetCode: row.asset.assetCode,
    assetName: row.asset.name,
    quantity: num(row.quantity) ?? 0,
    sourceProjectId: row.sourceProjectId,
    sourceProjectName: row.sourceProject?.name ?? null,
    destinationProjectId: row.destinationProjectId ?? "",
    destinationProjectName: row.destinationProject?.name ?? "",
    destinationLocation: row.destinationLocation,
    transferDate: row.transferDate?.toISOString().slice(0, 10) ?? "",
    gatePassNo: row.gatePassNo,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTransfers(opts: {
  orgId: string;
  search?: string;
  orderBy?: Prisma.CnFixedAssetTransactionOrderByWithRelationInput[];
  take?: number;
  skip?: number;
}) {
  const where: Prisma.CnFixedAssetTransactionWhereInput = {
    orgId: opts.orgId,
    recordType: FA_TRANSFER,
  };
  const search = opts.search?.trim();
  if (search) {
    where.OR = [
      { referenceNumber: { contains: search, mode: "insensitive" } },
      { gatePassNo: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      { asset: { assetCode: { contains: search, mode: "insensitive" } } },
      { asset: { name: { contains: search, mode: "insensitive" } } },
    ];
  }
  const [rows, total] = await Promise.all([
    db.cnFixedAssetTransaction.findMany({
      where,
      include: transferInclude,
      orderBy: opts.orderBy ?? [{ transferDate: "desc" }, { createdAt: "desc" }],
      ...(opts.take != null ? { take: opts.take, skip: opts.skip ?? 0 } : {}),
    }),
    db.cnFixedAssetTransaction.count({ where }),
  ]);
  return { data: rows.map(toTransferRecord), total };
}

export async function createTransfer(input: {
  orgId: string;
  userId: string;
  assetId: string;
  destinationProjectId: string;
  destinationLocation?: string | null;
  quantity: number;
  transferDate: string;
  reason?: string | null;
}) {
  if (input.quantity <= 0) throw new Error("INVALID_QTY");
  const asset = await db.cnAsset.findFirst({
    where: { id: input.assetId, orgId: input.orgId },
    select: { projectId: true },
  });
  if (!asset) throw new Error("ASSET_NOT_FOUND");

  const qtyState = await getAssetQtyState(input.orgId, input.assetId);
  if (input.quantity > qtyState.available) throw new Error("INSUFFICIENT_QTY");

  const transferNumber = await nextNumber(input.orgId, "transfer");
  const row = await db.cnFixedAssetTransaction.create({
    data: {
      orgId: input.orgId,
      recordType: FA_TRANSFER,
      referenceNumber: transferNumber,
      assetId: input.assetId,
      sourceProjectId: asset.projectId,
      destinationProjectId: input.destinationProjectId,
      destinationLocation: input.destinationLocation ?? null,
      quantity: input.quantity,
      transferDate: parseDate(input.transferDate),
      gatePassNo: `GP-${transferNumber}`,
      reason: input.reason ?? null,
      status: "in_transit",
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: transferInclude,
  });
  return toTransferRecord(row);
}

export async function patchTransfer(opts: {
  orgId: string;
  userId: string;
  id: string;
  action: "receive" | "cancel";
}) {
  const existing = await db.cnFixedAssetTransaction.findFirst({
    where: { id: opts.id, orgId: opts.orgId, recordType: FA_TRANSFER },
    include: { asset: { select: { id: true } } },
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status !== "in_transit") throw new Error("INVALID_STATUS");

  if (opts.action === "cancel") {
    const row = await db.cnFixedAssetTransaction.update({
      where: { id: opts.id },
      data: { status: "cancelled", updatedBy: opts.userId },
      include: transferInclude,
    });
    return toTransferRecord(row);
  }

  await db.cnAsset.update({
    where: { id: existing.assetId },
    data: {
      projectId: existing.destinationProjectId,
      currentLocation: existing.destinationLocation,
      updatedBy: opts.userId,
    },
  });

  const row = await db.cnFixedAssetTransaction.update({
    where: { id: opts.id },
    data: { status: "received", updatedBy: opts.userId },
    include: transferInclude,
  });
  return toTransferRecord(row);
}

const repairInclude = {
  asset: { select: { assetCode: true, name: true } },
} as const;

function toRepairRecord(
  row: Prisma.CnFixedAssetTransactionGetPayload<{ include: typeof repairInclude }>,
): FixedAssetRepairRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    repairNumber: row.referenceNumber,
    assetId: row.assetId,
    assetCode: row.asset.assetCode,
    assetName: row.asset.name,
    quantity: num(row.quantity) ?? 0,
    problem: row.problem,
    repairCost: num(row.repairCost) ?? 0,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRepairs(opts: { orgId: string }) {
  const rows = await db.cnFixedAssetTransaction.findMany({
    where: { orgId: opts.orgId, recordType: FA_REPAIR },
    include: repairInclude,
    orderBy: { createdAt: "desc" },
  });
  return { data: rows.map(toRepairRecord), total: rows.length };
}

export async function createRepair(input: {
  orgId: string;
  userId: string;
  assetId: string;
  quantity: number;
  problem?: string | null;
  repairCost?: number;
}) {
  if (input.quantity <= 0) throw new Error("INVALID_QTY");
  const qtyState = await getAssetQtyState(input.orgId, input.assetId);
  if (input.quantity > qtyState.available) throw new Error("INSUFFICIENT_QTY");

  const repairNumber = await nextNumber(input.orgId, "repair");
  const row = await db.cnFixedAssetTransaction.create({
    data: {
      orgId: input.orgId,
      recordType: FA_REPAIR,
      referenceNumber: repairNumber,
      assetId: input.assetId,
      quantity: input.quantity,
      problem: input.problem ?? null,
      repairCost: input.repairCost ?? 0,
      status: "open",
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: repairInclude,
  });
  return toRepairRecord(row);
}

export async function closeRepair(opts: {
  orgId: string;
  userId: string;
  id: string;
  repairCost?: number;
}) {
  const existing = await db.cnFixedAssetTransaction.findFirst({
    where: { id: opts.id, orgId: opts.orgId, recordType: FA_REPAIR },
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status !== "open") throw new Error("INVALID_STATUS");

  const row = await db.cnFixedAssetTransaction.update({
    where: { id: opts.id },
    data: {
      status: "closed",
      repairCost: opts.repairCost ?? num(existing.repairCost) ?? 0,
      updatedBy: opts.userId,
    },
    include: repairInclude,
  });
  return toRepairRecord(row);
}

const auditInclude = {
  asset: { select: { assetCode: true, name: true } },
} as const;

function toAuditRecord(
  row: Prisma.CnFixedAssetTransactionGetPayload<{ include: typeof auditInclude }>,
): FixedAssetAuditRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    auditNumber: row.referenceNumber,
    assetId: row.assetId,
    assetCode: row.asset.assetCode,
    assetName: row.asset.name,
    bookQty: num(row.bookQty) ?? 0,
    countedQty: num(row.countedQty) ?? 0,
    varianceQty: num(row.varianceQty) ?? 0,
    auditDate: row.auditDate?.toISOString().slice(0, 10) ?? "",
    remarks: row.remarks,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAudits(opts: { orgId: string }) {
  const rows = await db.cnFixedAssetTransaction.findMany({
    where: { orgId: opts.orgId, recordType: FA_AUDIT },
    include: auditInclude,
    orderBy: [{ auditDate: "desc" }, { createdAt: "desc" }],
  });
  return { data: rows.map(toAuditRecord), total: rows.length };
}

export async function createAudit(input: {
  orgId: string;
  userId: string;
  assetId: string;
  countedQty: number;
  auditDate: string;
  remarks?: string | null;
}) {
  const asset = await db.cnAsset.findFirst({
    where: { id: input.assetId, orgId: input.orgId },
    select: { currentStock: true },
  });
  if (!asset) throw new Error("ASSET_NOT_FOUND");

  const bookQty = num(asset.currentStock) ?? 0;
  const varianceQty = computeAuditVariance(bookQty, input.countedQty);
  const auditNumber = await nextNumber(input.orgId, "audit");

  const row = await db.cnFixedAssetTransaction.create({
    data: {
      orgId: input.orgId,
      recordType: FA_AUDIT,
      referenceNumber: auditNumber,
      assetId: input.assetId,
      bookQty,
      countedQty: input.countedQty,
      varianceQty,
      auditDate: parseDate(input.auditDate),
      remarks: input.remarks ?? null,
      status: "draft",
      createdBy: input.userId,
      updatedBy: input.userId,
    },
    include: auditInclude,
  });
  return toAuditRecord(row);
}

export async function adjustAudit(opts: {
  orgId: string;
  userId: string;
  id: string;
}) {
  const existing = await db.cnFixedAssetTransaction.findFirst({
    where: { id: opts.id, orgId: opts.orgId, recordType: FA_AUDIT },
  });
  if (!existing) throw new Error("NOT_FOUND");
  if (existing.status === "adjusted") throw new Error("ALREADY_ADJUSTED");

  const counted = num(existing.countedQty) ?? 0;
  const book = num(existing.bookQty) ?? 0;
  const variance = counted - book;

  const asset = await db.cnAsset.findFirst({
    where: { id: existing.assetId, orgId: opts.orgId },
    select: { lostQty: true },
  });

  await db.cnAsset.update({
    where: { id: existing.assetId },
    data: {
      currentStock: counted,
      ...(variance < 0
        ? { lostQty: (num(asset?.lostQty) ?? 0) + Math.abs(variance) }
        : {}),
      updatedBy: opts.userId,
    },
  });

  const row = await db.cnFixedAssetTransaction.update({
    where: { id: opts.id },
    data: { status: "adjusted", updatedBy: opts.userId },
    include: auditInclude,
  });
  return toAuditRecord(row);
}

export async function listDepreciation(opts: {
  orgId: string;
}): Promise<{ data: FixedAssetDepreciationRow[]; total: number }> {
  const assets = await db.cnAsset.findMany({
    where: { orgId: opts.orgId, status: { not: "Disposed" } },
    select: {
      id: true,
      assetCode: true,
      name: true,
      purchaseValue: true,
      accumulatedDepr: true,
      deprMethod: true,
      deprRate: true,
    },
    orderBy: { assetCode: "asc" },
  });

  const data: FixedAssetDepreciationRow[] = assets.map((a) => {
    const cost = num(a.purchaseValue) ?? 0;
    const accum = num(a.accumulatedDepr) ?? 0;
    const rate = num(a.deprRate);
    const annualDepr = computeAnnualDepreciation(
      cost,
      accum,
      a.deprMethod,
      rate,
    );
    return {
      id: a.id,
      assetCode: a.assetCode,
      assetName: a.name,
      deprMethod: a.deprMethod,
      deprRate: rate,
      cost: round2(cost),
      accumulatedDepr: round2(accum),
      annualDepr,
      bookValue: computeBookValue(cost, accum),
    };
  });

  return { data, total: data.length };
}
