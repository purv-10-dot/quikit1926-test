/**
 * GRN master — Prisma-backed CRUD for `cn_goods_receipt_notes` +
 * `cn_grn_lines`.
 */

import { db } from "@/lib/db/prisma";

export interface GRNLineInput {
  poLineId?: string | null;
  itemId: string;
  uomId?: string | null;
  uomCode?: string | null;
  unitRate: string | number;
  receivedQty: string | number;
  acceptedQty?: string | number | null;
  rejectedQty?: string | number | null;
  batchNo?: string | null;
  heatNo?: string | null;
  condition?: string | null;
  testCertRef?: string | null;
  remarks?: string | null;
}

export interface CreateGRNInput {
  orgId: string;
  createdBy: string;
  grnNumber: string;
  poId: string;
  projectId: string;
  vendorId: string;
  grnDate: Date;
  locationId: string;
  storageLocationId?: string | null;
  supplierInvoiceNo?: string | null;
  supplierInvoiceDate?: Date | null;
  challanNo?: string | null;
  challanDate?: Date | null;
  receivedById?: string | null;
  receivedByName?: string | null;
  vehicleNo?: string | null;
  ewayBillNo?: string | null;
  approxInvoiceValue?: string | number | null;
  challanAttachment?: string | null;
  overallQualityStatus?: string | null;
  weighbridgeSlipNo?: string | null;
  remarks?: string | null;
  status?: string;
  lines: GRNLineInput[];
}

function dec(n: string | number | null | undefined): string | null {
  if (n === null || n === undefined || n === "") return null;
  const s = String(n).trim();
  if (s === "") return null;
  const f = parseFloat(s);
  if (!Number.isFinite(f)) return null;
  return s;
}

function isoDate(d: any): string {
  if (!d) return "";
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

async function resolveUomByCode(
  orgId: string,
  uomCode: string | null | undefined,
): Promise<string | null> {
  const code = String(uomCode ?? "").trim().toUpperCase();
  if (!code) return null;
  try {
    const row = await (db as any).cnUOM.findFirst({
      where: { orgId, code },
      select: { id: true },
    });
    return row?.id ?? null;
  } catch {
    return null;
  }
}

function enrichLine(row: any, itemById: Map<string, any>, uomById: Map<string, any>): any {
  const item = row.itemId ? itemById.get(row.itemId) : null;
  const uom = row.uomId ? uomById.get(row.uomId) : null;
  return {
    id: row.id,
    lineId: row.id,
    poLineId: row.poLineId ?? null,
    itemId: row.itemId,
    itemCode: item?.code ?? "",
    itemName: item?.name ?? "",
    uomId: row.uomId,
    uomCode: uom?.code ?? "",
    receivedQty: String(row.receivedQty ?? "0"),
    qtyReceived: String(row.receivedQty ?? "0"),
    acceptedQty: String(row.acceptedQty ?? "0"),
    qtyAccepted: String(row.acceptedQty ?? "0"),
    rejectedQty: String(row.rejectedQty ?? "0"),
    qtyRejected: String(row.rejectedQty ?? "0"),
    shortQty: String(row.shortQty ?? "0"),
    unitRate: String(row.unitRate ?? "0"),
    amount: String(row.amount ?? "0"),
    qualityStatus: row.qualityStatus ?? "pending",
    batchNo: row.batchNo ?? "",
    heatNo: row.heatNo ?? "",
    condition: row.condition ?? "Good",
    testCertRef: row.testCertRef ?? "",
    remarks: row.remarks ?? "",
  };
}

function enrichGRN(row: any, itemById: Map<string, any>, uomById: Map<string, any>): any {
  const lines = (row.lines ?? []).map((l: any) => enrichLine(l, itemById, uomById));
  const project = row.project ?? null;
  const vendor = row.vendor ?? null;
  const po = row.po ?? null;
  const grnTotalExGST = lines.reduce(
    (s: number, l: any) => s + (parseFloat(l.amount) || 0),
    0,
  );
  return {
    id: row.id,
    orgId: row.orgId,
    grnNumber: row.grnNumber,
    poId: row.poId,
    poNumber: po?.poNumber ?? "",
    projectId: row.projectId,
    projectName: project?.name ?? "",
    projectCode: project?.code ?? "",
    vendorId: row.vendorId,
    vendorName: vendor?.companyName || vendor?.name || "",
    vendorGSTIN: vendor?.gstin ?? "",
    grnDate: isoDate(row.grnDate),
    locationId: row.locationId ?? null,
    storageLocationId: row.storageLocationId ?? null,
    supplierInvoiceNo: row.supplierInvoiceNo ?? "",
    vendorInvoiceNo: row.supplierInvoiceNo ?? "",
    supplierInvoiceDate: isoDate(row.supplierInvoiceDate),
    vendorInvoiceDate: isoDate(row.supplierInvoiceDate),
    challanNo: row.challanNo ?? "",
    challanDate: isoDate(row.challanDate),
    receivedById: row.receivedById ?? null,
    receivedByName: row.receivedByName ?? "",
    inspectedById: row.inspectedById ?? null,
    vehicleNo: row.vehicleNo ?? "",
    ewayBillNo: row.ewayBillNo ?? "",
    approxInvoiceValue:
      row.approxInvoiceValue != null ? String(row.approxInvoiceValue) : "",
    challanAttachment: row.challanAttachment ?? "",
    overallQualityStatus: row.overallQualityStatus ?? "",
    weighbridgeSlipNo: row.weighbridgeSlipNo ?? "",
    remarks: row.remarks ?? "",
    status: row.status,
    approvalId: row.approvalId ?? null,
    lineCount: lines.length,
    grnTotalExGST: String(Math.round(grnTotalExGST * 100) / 100),
    lines,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

async function loadLineLookups(
  rows: any[],
): Promise<{ itemById: Map<string, any>; uomById: Map<string, any> }> {
  const itemIds = new Set<string>();
  const uomIds = new Set<string>();
  for (const r of rows) {
    for (const l of r.lines ?? []) {
      if (l.itemId) itemIds.add(l.itemId);
      if (l.uomId) uomIds.add(l.uomId);
    }
  }
  const [items, uoms] = await Promise.all([
    itemIds.size > 0
      ? (db as any).cnItem.findMany({
          where: { id: { in: Array.from(itemIds) } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    uomIds.size > 0
      ? (db as any).cnUOM.findMany({
          where: { id: { in: Array.from(uomIds) } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
  ]);
  const itemById = new Map<string, any>();
  for (const i of items) itemById.set(i.id, i);
  const uomById = new Map<string, any>();
  for (const u of uoms) uomById.set(u.id, u);
  return { itemById, uomById };
}

export interface ListGRNsOptions {
  orgId: string;
  projectIds?: string[] | null;
  status?: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

export async function listGRNs(opts: ListGRNsOptions): Promise<any[]> {
  const where: Record<string, unknown> = { orgId: opts.orgId };
  if (opts.status && opts.status !== "all") where.status = opts.status;
  if (Array.isArray(opts.projectIds)) {
    where.projectId = { in: opts.projectIds };
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    where.OR = [
      { grnNumber: { contains: q, mode: "insensitive" } },
      { supplierInvoiceNo: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await (db as any).cnGoodsReceiptNote.findMany({
    where,
    include: {
      lines: true,
      po: { select: { id: true, poNumber: true } },
      project: { select: { id: true, name: true, code: true } },
      vendor: {
        select: { id: true, name: true, companyName: true, gstin: true },
      },
    },
    orderBy: { grnDate: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  const { itemById, uomById } = await loadLineLookups(rows);
  return rows.map((r: any) => enrichGRN(r, itemById, uomById));
}

export async function findGRNById(
  orgId: string,
  id: string,
): Promise<any | null> {
  const row = await (db as any).cnGoodsReceiptNote.findFirst({
    where: { id, orgId },
    include: {
      lines: true,
      po: { select: { id: true, poNumber: true } },
      project: { select: { id: true, name: true, code: true } },
      vendor: {
        select: { id: true, name: true, companyName: true, gstin: true },
      },
    },
  });
  if (!row) return null;
  const { itemById, uomById } = await loadLineLookups([row]);
  return enrichGRN(row, itemById, uomById);
}

export async function createGRN(input: CreateGRNInput): Promise<any> {
  const resolvedLines = await Promise.all(
    input.lines.map(async (l) => {
      let uomId = l.uomId ?? null;
      if (!uomId && l.uomCode) {
        uomId = await resolveUomByCode(input.orgId, l.uomCode);
      }
      const num = (raw: any): number => {
        const n = parseFloat(String(raw ?? "").trim());
        return Number.isFinite(n) ? n : 0;
      };
      const received = num(l.receivedQty);
      const rejected = num(l.rejectedQty);
      const parsedAccepted = l.acceptedQty != null ? num(l.acceptedQty) : NaN;
      const accepted = Number.isFinite(parsedAccepted)
        ? parsedAccepted
        : Math.max(received - rejected, 0);
      const unitRate = num(l.unitRate);
      const amount = Math.round(accepted * unitRate * 100) / 100;
      return {
        ...l,
        uomIdResolved: uomId,
        _received: received,
        _rejected: rejected,
        _accepted: accepted,
        _amount: amount,
      };
    }),
  );

  for (const l of resolvedLines) {
    if (!l.uomIdResolved) {
      throw new Error(
        `UOM could not be resolved for item ${l.itemId}. Pass uomId or a uomCode that exists.`,
      );
    }
  }

  const buildHeader = (includeDrift: boolean): Record<string, any> => {
    const base: Record<string, any> = {
      orgId: input.orgId,
      grnNumber: input.grnNumber,
      poId: input.poId,
      projectId: input.projectId,
      vendorId: input.vendorId,
      grnDate: input.grnDate,
      locationId: input.locationId,
      storageLocationId: input.storageLocationId ?? null,
      supplierInvoiceNo: input.supplierInvoiceNo ?? null,
      supplierInvoiceDate: input.supplierInvoiceDate ?? null,
      challanNo: input.challanNo ?? null,
      challanDate: input.challanDate ?? null,
      receivedById: input.receivedById ?? input.createdBy,
      remarks: input.remarks ?? null,
      status: input.status ?? "draft",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    };
    if (includeDrift) {
      base.receivedByName = input.receivedByName ?? null;
      base.vehicleNo = input.vehicleNo ?? null;
      base.ewayBillNo = input.ewayBillNo ?? null;
      base.approxInvoiceValue = dec(input.approxInvoiceValue);
      base.challanAttachment = input.challanAttachment ?? null;
      base.overallQualityStatus = input.overallQualityStatus ?? null;
      base.weighbridgeSlipNo = input.weighbridgeSlipNo ?? null;
    }
    return base;
  };

  const lineData = resolvedLines.map((l) => ({
    poLineId: l.poLineId ?? "",
    itemId: l.itemId,
    receivedQty: String(l._received),
    acceptedQty: String(l._accepted),
    rejectedQty: String(l._rejected),
    shortQty: "0",
    uomId: l.uomIdResolved,
    unitRate: dec(l.unitRate) ?? "0",
    amount: String(l._amount),
    qualityStatus:
      l._rejected > 0
        ? l._accepted > 0
          ? "conditional"
          : "rejected"
        : "accepted",
    batchNo: l.batchNo ?? null,
    heatNo: l.heatNo ?? null,
    condition: l.condition ?? "Good",
    testCertRef: l.testCertRef ?? null,
    remarks: l.remarks ?? null,
  }));

  let created: any;
  let needsBackfill = false;
  try {
    created = await (db as any).cnGoodsReceiptNote.create({
      data: { ...buildHeader(true), lines: { create: lineData } },
      include: {
        lines: true,
        po: { select: { id: true, poNumber: true } },
        project: { select: { id: true, name: true, code: true } },
        vendor: {
          select: { id: true, name: true, companyName: true, gstin: true },
        },
      },
    });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    const isDrift =
      msg.includes("Unknown argument") &&
      (msg.includes("receivedByName") ||
        msg.includes("vehicleNo") ||
        msg.includes("ewayBillNo") ||
        msg.includes("approxInvoiceValue") ||
        msg.includes("challanAttachment") ||
        msg.includes("overallQualityStatus") ||
        msg.includes("weighbridgeSlipNo"));
    if (isDrift) {
      console.warn(
        "[grn-repository] Prisma client missing new GRN columns — " +
          "creating without them and back-filling via raw SQL.",
      );
      created = await (db as any).cnGoodsReceiptNote.create({
        data: { ...buildHeader(false), lines: { create: lineData } },
        include: {
          lines: true,
          po: { select: { id: true, poNumber: true } },
          project: { select: { id: true, name: true, code: true } },
          vendor: {
            select: { id: true, name: true, companyName: true, gstin: true },
          },
        },
      });
      needsBackfill = true;
    } else {
      throw err;
    }
  }

  if (needsBackfill) {
    await (db as any).$executeRaw`
      UPDATE app_quikinfra."Goods_receipt_notes"
      SET "receivedByName"      = ${input.receivedByName ?? null},
          "vehicleNo"           = ${input.vehicleNo ?? null},
          "ewayBillNo"          = ${input.ewayBillNo ?? null},
          "approxInvoiceValue"  = ${dec(input.approxInvoiceValue)}::numeric,
          "challanAttachment"   = ${input.challanAttachment ?? null},
          "overallQualityStatus"= ${input.overallQualityStatus ?? null},
          "weighbridgeSlipNo"   = ${input.weighbridgeSlipNo ?? null}
      WHERE id = ${created.id}
    `;
  }

  const { itemById, uomById } = await loadLineLookups([created]);
  return enrichGRN(created, itemById, uomById);
}
