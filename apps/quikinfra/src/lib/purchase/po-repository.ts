/**
 * Purchase Order master — Prisma-backed CRUD for `cn_purchase_orders`
 * and `cn_purchase_order_lines`.
 *
 * Response shape is deliberately compatible with the legacy demo-store
 * shape so the PO list/detail pages and the PDF generator don't need
 * to change: `vendorName`, `projectName`, `projectCode`,
 * `poValueExGst`, `materialValueExGst`, `totalGstAmount`, etc. are
 * computed on read.
 *
 * Schema-drift tolerance: if the generated Prisma client doesn't yet
 * know about the recently-added columns (freight / GST split /
 * deliveryAddress / termsAndConditions), the create path silently
 * retries with those fields dropped and back-fills them via raw SQL.
 * The read path uses a `$queryRaw` augmentation to return the missing
 * columns regardless of whether the client is fresh.
 */

import { db } from "@/lib/db/prisma";

export interface POLineInput {
  indentLineId?: string | null;
  itemId: string;
  itemCode?: string | null;
  itemName?: string | null;
  uomId?: string | null;
  uomCode?: string | null;
  hsnCode?: string | null;
  specification?: string | null;
  poQty: string | number;
  unitRate: string | number;
  discount?: string | number | null;
  gstRate?: string | number | null;
  gstType?: string | null;
  igstAmount?: string | number | null;
  cgstAmount?: string | number | null;
  sgstAmount?: string | number | null;
  amount?: string | number | null;
  taxAmount?: string | number | null;
  totalAmount?: string | number | null;
  deliveryDate?: string | Date | null;
  remarks?: string | null;
  isRCM?: boolean;
}

export interface CreatePOInput {
  orgId: string;
  createdBy: string;
  poNumber: string;
  projectId: string;
  vendorId: string;
  indentId?: string | null;
  rfqId?: string | null;
  poDate: Date;
  deliveryDate?: Date | null;
  deliveryLocationId?: string | null;
  deliveryAddress?: string | null;
  paymentTermsDays?: number | null;
  termsConditionId?: string | null;
  termsAndConditions?: string | null;
  remarks?: string | null;
  isUrgentLocal?: boolean;
  urgentLocalReason?: string | null;
  /** Subject / "Supply For" printed on the PDF. */
  purpose?: string | null;
  /** Extra header-level charges (non-freight). */
  otherCharges?: string | number | null;
  /** Buyer-side contact(s). Comma-separated string (already joined
      upstream from the multi-row contacts section). */
  contactPerson?: string | null;
  contactMobile?: string | null;
  subtotal: string | number;
  freightCharges?: string | number | null;
  taxAmount: string | number;
  totalIGST?: string | number | null;
  totalCGST?: string | number | null;
  totalSGST?: string | number | null;
  totalAmount: string | number;
  status?: string;
  lines: POLineInput[];
}

function dec(n: string | number | null | undefined): string | null {
  if (n === null || n === undefined || n === "") return null;
  const s = String(n).trim();
  if (s === "") return null;
  const f = parseFloat(s);
  if (!Number.isFinite(f)) return null;
  return s;
}

function parseDate(raw: any): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(d: any): string {
  if (!d) return "";
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return String(d).slice(0, 10);
  }
}

// ─── UOM resolution (demo-store miss is OK, lookup by code) ───────

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

// ─── Shape enrichment (compatible with legacy demo-store readers) ──

function enrichLine(row: any, itemById: Map<string, any>, uomById: Map<string, any>): any {
  const item = row.itemId ? itemById.get(row.itemId) : null;
  const uom = row.uomId ? uomById.get(row.uomId) : null;
  const gstRate = row.gstRate != null ? String(row.gstRate) : "0";
  const amount = String(row.amount ?? "0");
  const taxAmount = String(row.taxAmount ?? "0");
  const totalAmount = String(row.totalAmount ?? "0");
  const igstAmount = String(row.igstAmount ?? "0");
  const cgstAmount = String(row.cgstAmount ?? "0");
  const sgstAmount = String(row.sgstAmount ?? "0");
  const isRCM =
    parseFloat(igstAmount) === 0 &&
    parseFloat(cgstAmount) === 0 &&
    parseFloat(sgstAmount) === 0 &&
    parseFloat(gstRate) > 0;
  return {
    id: row.id,
    itemId: row.itemId,
    itemCode: item?.code ?? "",
    itemName: item?.name ?? "",
    hsnCode: item?.hsnCode ?? "",
    uomId: row.uomId,
    uomCode: uom?.code ?? "",
    poQty: String(row.orderedQty ?? row.quantity ?? "0"),
    quantity: String(row.orderedQty ?? row.quantity ?? "0"),
    receivedQty: String(row.receivedQty ?? "0"),
    pendingQty: String(row.pendingQty ?? "0"),
    unitRate: String(row.unitRate ?? "0"),
    discount: "0",
    gstRate,
    gstType: parseFloat(igstAmount) > 0 ? "IGST" : "CGST+SGST",
    amount,
    igstAmount,
    cgstAmount,
    sgstAmount,
    taxAmount,
    totalAmount,
    isRCM,
    specification: row.specification ?? "",
    deliveryDate: row.deliveryDate ? isoDate(row.deliveryDate) : null,
    remarks: row.remarks ?? "",
    indentLineId: row.indentLineId ?? null,
  };
}

function enrichPO(row: any, itemById: Map<string, any>, uomById: Map<string, any>): any {
  const lines = (row.lines ?? []).map((l: any) => enrichLine(l, itemById, uomById));
  const project = row.project ?? null;
  const vendor = row.vendor ?? null;
  const subtotal = String(row.subtotal ?? "0");
  const freightCharges = String(row.freightCharges ?? "0");
  const taxAmount = String(row.taxAmount ?? "0");
  const totalAmount = String(row.totalAmount ?? "0");
  const totalIGST = String(row.totalIGST ?? "0");
  const totalCGST = String(row.totalCGST ?? "0");
  const totalSGST = String(row.totalSGST ?? "0");
  const poValueExGst = String(
    parseFloat(subtotal) + parseFloat(freightCharges || "0"),
  );
  const gstType = parseFloat(totalIGST) > 0 ? "IGST" : "CGST+SGST";
  return {
    id: row.id,
    orgId: row.orgId,
    poNumber: row.poNumber,
    projectId: row.projectId,
    projectName: project?.name ?? "",
    projectCode: project?.code ?? "SITE",
    vendorId: row.vendorId,
    vendorName: vendor?.companyName || vendor?.name || "",
    vendorGSTIN: vendor?.gstin ?? "",
    vendorState: vendor?.state ?? "",
    vendorEmail: vendor?.email ?? "",
    vendorPhone: vendor?.phone ?? "",
    vendorContactPerson: vendor?.contactPerson ?? "",
    vendorAddress:
      [vendor?.address, vendor?.city, vendor?.state, vendor?.pincode]
        .filter((x: any) => x && String(x).trim())
        .join(", ") || "",
    sourceIndentId: row.indentId ?? null,
    sourceIndentNumber: "", // filled separately if needed
    sourceRfqId: row.rfqId ?? null,
    sourceRfqNumber: "",
    poDate: isoDate(row.poDate),
    deliveryDate: row.deliveryDate ? isoDate(row.deliveryDate) : "",
    deliveryAddress: row.deliveryAddress ?? "",
    deliveryLocationId: row.deliveryLocationId ?? null,
    paymentTerms: row.paymentTermsDays != null ? `Net ${row.paymentTermsDays}` : "",
    paymentTermsDays: row.paymentTermsDays ?? null,
    termsTemplateId: row.termsConditionId ?? null,
    termsAndConditions: row.termsAndConditions ?? "",
    remarks: row.remarks ?? "",
    isUrgentLocal: !!row.isUrgentLocal,
    urgentLocalReason: row.urgentLocalReason ?? "",
    purpose: row.purpose ?? "",
    otherCharges: String(row.otherCharges ?? "0"),
    contactPerson: row.contactPerson ?? "",
    contactMobile: row.contactMobile ?? "",
    // Finance
    materialValueExGst: subtotal,
    freightCharges,
    poValueExGst,
    totalIGST,
    totalCGST,
    totalSGST,
    totalGstAmount: taxAmount,
    taxAmount,
    totalAmount,
    advanceAmount: "0",
    gstType,
    isRCM: lines.some((l: any) => l.isRCM),
    // Status / lines
    status: row.status,
    approvalId: row.approvalId ?? null,
    approvalThresholdMet: !!row.approvalThresholdMet,
    lineCount: lines.length,
    lines,
    // Manual closure metadata — surfaced so the detail page can render
    // a "Closed by … on … because …" banner without a second fetch.
    closedAt: row.closedAt?.toISOString?.() ?? null,
    closedBy: row.closedBy ?? null,
    closeReason: row.closeReason ?? null,
    // Computed on every read: a PO is "overdue" when its delivery date
    // has passed AND it isn't already in a terminal state. Used by the
    // list page to flash an amber badge and by the detail page to fire
    // the "Close this PO?" popup. Computed here (not stored) so today's
    // boundary moves with real time without a nightly job.
    isOverdue: (() => {
      if (!row.deliveryDate) return false;
      const terminal = new Set(["closed", "fully_received", "rejected", "cancelled"]);
      if (terminal.has(String(row.status))) return false;
      // Compare in calendar-day terms so a PO with deliveryDate = today
      // is NOT considered overdue until tomorrow.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dd = new Date(row.deliveryDate);
      dd.setHours(0, 0, 0, 0);
      return dd.getTime() < today.getTime();
    })(),
    version: 1,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

// ─── Drift backfill (same pattern as rfq-repository) ──────────────

async function augmentPOsWithDriftFields(poRows: any[]): Promise<void> {
  if (poRows.length === 0) return;
  if ("freightCharges" in poRows[0]) return;

  try {
    const ids = poRows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return;
    const headers: Array<{
      id: string;
      freightCharges: string | null;
      totalIGST: string | null;
      totalCGST: string | null;
      totalSGST: string | null;
      deliveryAddress: string | null;
      termsAndConditions: string | null;
      purpose: string | null;
      otherCharges: string | null;
      contactPerson: string | null;
      contactMobile: string | null;
    }> = await (db as any).$queryRaw`
      SELECT id, "freightCharges", "totalIGST", "totalCGST", "totalSGST",
             "deliveryAddress", "termsAndConditions", "purpose",
             "otherCharges", "contactPerson", "contactMobile"
      FROM app_quikinfra."Purchase_orders"
      WHERE id = ANY(${ids})
    `;
    const byId = new Map(headers.map((h) => [h.id, h]));
    for (const r of poRows) {
      const hit = byId.get(r.id);
      if (!hit) continue;
      r.freightCharges = hit.freightCharges;
      r.totalIGST = hit.totalIGST;
      r.totalCGST = hit.totalCGST;
      r.totalSGST = hit.totalSGST;
      r.deliveryAddress = hit.deliveryAddress;
      r.termsAndConditions = hit.termsAndConditions;
      r.purpose = hit.purpose;
      r.otherCharges = hit.otherCharges;
      r.contactPerson = hit.contactPerson;
      r.contactMobile = hit.contactMobile;
    }

    // Same for lines — pull per-line GST split columns.
    const lineIds: string[] = [];
    for (const r of poRows) {
      for (const l of r.lines ?? []) {
        if (l?.id) lineIds.push(l.id);
      }
    }
    if (lineIds.length === 0) return;
    const lineExtras: Array<{
      id: string;
      gstRate: string | null;
      igstAmount: string | null;
      cgstAmount: string | null;
      sgstAmount: string | null;
      specification: string | null;
    }> = await (db as any).$queryRaw`
      SELECT id, "gstRate", "igstAmount", "cgstAmount", "sgstAmount", "specification"
      FROM app_quikinfra."Purchase_order_lines"
      WHERE id = ANY(${lineIds})
    `;
    const lineById = new Map(lineExtras.map((l) => [l.id, l]));
    for (const r of poRows) {
      for (const l of r.lines ?? []) {
        const hit = lineById.get(l.id);
        if (!hit) continue;
        l.gstRate = hit.gstRate;
        l.igstAmount = hit.igstAmount;
        l.cgstAmount = hit.cgstAmount;
        l.sgstAmount = hit.sgstAmount;
        l.specification = hit.specification;
      }
    }
  } catch (err: any) {
    console.warn(
      "[po-repository] augmentPOsWithDriftFields raw SQL failed:",
      err?.message ?? err,
    );
  }
}

// ─── Lookups (items + UOMs in one trip) ────────────────────────────

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
          select: { id: true, code: true, name: true, hsnCode: true },
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

// ─── Public API ────────────────────────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive calendar range in UTC, aligned with `isoDate()` / report FY pills. */
function poDateRangeFromFY(
  fyStart: string | undefined,
  fyEnd: string | undefined,
): { gte: Date; lte: Date } | null {
  const a = String(fyStart ?? "").trim();
  const b = String(fyEnd ?? "").trim();
  if (!a || !b || !ISO_DAY.test(a) || !ISO_DAY.test(b)) return null;
  return {
    gte: new Date(`${a}T00:00:00.000Z`),
    lte: new Date(`${b}T23:59:59.999Z`),
  };
}

export interface ListPOsOptions {
  orgId: string;
  projectIds?: string[] | null;
  status?: string;
  projectId?: string;
  search?: string;
  /** When both set (YYYY-MM-DD), restricts `poDate` to that inclusive FY window. */
  fyStart?: string;
  fyEnd?: string;
}

export async function listPOs(opts: ListPOsOptions): Promise<any[]> {
  const where: Record<string, unknown> = { orgId: opts.orgId };
  if (opts.status && opts.status !== "all") where.status = opts.status;
  if (opts.projectId) where.projectId = opts.projectId;
  if (Array.isArray(opts.projectIds)) {
    where.projectId = opts.projectId
      ? opts.projectIds.includes(opts.projectId)
        ? opts.projectId
        : "__none__"
      : { in: opts.projectIds };
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    where.OR = [
      { poNumber: { contains: q, mode: "insensitive" } },
      { remarks: { contains: q, mode: "insensitive" } },
    ];
  }
  const fyRange = poDateRangeFromFY(opts.fyStart, opts.fyEnd);
  if (fyRange) {
    where.poDate = { gte: fyRange.gte, lte: fyRange.lte };
  }

  const rows = await (db as any).cnPurchaseOrder.findMany({
    where,
    include: {
      lines: true,
      project: { select: { id: true, name: true, code: true } },
      vendor: {
        select: {
          id: true,
          name: true,
          companyName: true,
          gstin: true,
          state: true,
          phone: true,
        },
      },
    },
    orderBy: { poDate: "desc" },
  });
  await augmentPOsWithDriftFields(rows);
  await hydrateCloseFields(rows);
  const { itemById, uomById } = await loadLineLookups(rows);
  const enriched = rows.map((r: any) => enrichPO(r, itemById, uomById));
  await attachSourceDocNumbers(enriched, rows);
  return enriched;
}

/**
 * Hydrate `closedAt`, `closedBy`, `closeReason` onto raw PO rows via
 * a single bulk raw-SQL lookup. The Prisma client doesn't always know
 * about these columns yet (the .dll regen is blocked while the dev
 * server is running, so the typed client may be stale even though the
 * columns exist in Postgres). Reading via `$queryRawUnsafe` skips the
 * client's column whitelist and returns whatever the DB has.
 *
 * Mutates rows in place — adds the three fields when missing so the
 * downstream `enrichPO` reads them like any other column.
 */
async function hydrateCloseFields(rows: any[]): Promise<void> {
  if (rows.length === 0) return;
  // Only hit the DB when the typed client didn't return the field —
  // once the server is restarted and Prisma regenerates, this becomes
  // a no-op.
  const needsHydration = rows.some((r) => r.closedAt === undefined);
  if (!needsHydration) return;
  const ids = rows.map((r) => r.id);
  const closeRows: any[] = await (db as any).$queryRawUnsafe(
    `SELECT id, "closedAt", "closedBy", "closeReason"
       FROM app_quikinfra."Purchase_orders"
      WHERE id = ANY($1::text[])`,
    ids,
  );
  const byId = new Map<string, any>(closeRows.map((r) => [r.id, r]));
  for (const r of rows) {
    const meta = byId.get(r.id);
    if (!meta) continue;
    r.closedAt = meta.closedAt ?? null;
    r.closedBy = meta.closedBy ?? null;
    r.closeReason = meta.closeReason ?? null;
  }
}

/**
 * Fill in `sourceIndentNumber` / `sourceRfqNumber` on enriched PO
 * rows via a single bulk lookup each. Done post-enrich so the list
 * and detail pages can render "Ref: <indent#>" without a per-row
 * join against `cn_purchase_indents` / `cn_rfqs`.
 */
async function attachSourceDocNumbers(
  enrichedRows: any[],
  rawRows: any[],
): Promise<void> {
  const indentIds = new Set<string>();
  const rfqIds = new Set<string>();
  for (const r of rawRows) {
    if (r.indentId) indentIds.add(r.indentId);
    if (r.rfqId) rfqIds.add(r.rfqId);
  }
  const [indentRows, rfqRows] = await Promise.all([
    indentIds.size
      ? (db as any).cnPurchaseIndent.findMany({
          where: { id: { in: Array.from(indentIds) } },
          select: { id: true, indentNumber: true },
        })
      : Promise.resolve([] as Array<{ id: string; indentNumber: string }>),
    rfqIds.size
      ? (db as any).cnRfq.findMany({
          where: { id: { in: Array.from(rfqIds) } },
          select: { id: true, rfqNumber: true },
        })
      : Promise.resolve([] as Array<{ id: string; rfqNumber: string }>),
  ]);
  const indentNumById = new Map<string, string>(
    indentRows.map((i: any) => [i.id, i.indentNumber]),
  );
  const rfqNumById = new Map<string, string>(
    rfqRows.map((i: any) => [i.id, i.rfqNumber]),
  );
  for (const row of enrichedRows) {
    if (row.sourceIndentId) {
      row.sourceIndentNumber =
        indentNumById.get(row.sourceIndentId) ?? row.sourceIndentNumber ?? "";
    }
    if (row.sourceRfqId) {
      row.sourceRfqNumber =
        rfqNumById.get(row.sourceRfqId) ?? row.sourceRfqNumber ?? "";
    }
  }
}

export async function findPOById(orgId: string, id: string): Promise<any | null> {
  const row = await (db as any).cnPurchaseOrder.findFirst({
    where: { id, orgId },
    include: {
      lines: true,
      project: { select: { id: true, name: true, code: true } },
      vendor: {
        // Broader set so the PO detail page's Vendor card can show
        // email, phone, and a full address without a second lookup.
        select: {
          id: true,
          name: true,
          companyName: true,
          gstin: true,
          email: true,
          phone: true,
          contactPerson: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
        },
      },
    },
  });
  if (!row) return null;
  await augmentPOsWithDriftFields([row]);
  await hydrateCloseFields([row]);
  const { itemById, uomById } = await loadLineLookups([row]);
  const enriched = enrichPO(row, itemById, uomById);
  await attachSourceDocNumbers([enriched], [row]);
  return enriched;
}

export async function createPO(input: CreatePOInput): Promise<any> {
  // Resolve UOMs per line up-front so the transaction stays short.
  const resolvedLines = await Promise.all(
    input.lines.map(async (l) => {
      let uomId = l.uomId ?? null;
      if (!uomId && l.uomCode) {
        uomId = await resolveUomByCode(input.orgId, l.uomCode);
      }
      const qty = parseFloat(String(l.poQty ?? "0")) || 0;
      const rate = parseFloat(String(l.unitRate ?? "0")) || 0;
      const baseAmount = l.amount != null ? parseFloat(String(l.amount)) : qty * rate;
      const igst = parseFloat(String(l.igstAmount ?? "0")) || 0;
      const cgst = parseFloat(String(l.cgstAmount ?? "0")) || 0;
      const sgst = parseFloat(String(l.sgstAmount ?? "0")) || 0;
      const tax = igst + cgst + sgst;
      const total = l.totalAmount != null ? parseFloat(String(l.totalAmount)) : baseAmount + tax;
      return {
        ...l,
        uomIdResolved: uomId,
        _qty: qty,
        _amount: baseAmount,
        _tax: tax,
        _total: total,
        _igst: igst,
        _cgst: cgst,
        _sgst: sgst,
      };
    }),
  );

  // Validate uomId — required by schema. Any missing one is a hard
  // error; the caller should have provided uomId or uomCode.
  for (const l of resolvedLines) {
    if (!l.uomIdResolved) {
      throw new Error(
        `UOM could not be resolved for item ${l.itemId}. ` +
          `Pass either uomId or a uomCode that exists in the master.`,
      );
    }
  }

  const ts = input.poDate ?? new Date();

  // Build the header payload. `buildHeader(includeDrift)` toggles the
  // recently-added columns on/off so we can retry without them when
  // the Prisma client is stale.
  const buildHeader = (includeDrift: boolean): Record<string, any> => {
    const base: Record<string, any> = {
      orgId: input.orgId,
      poNumber: input.poNumber,
      projectId: input.projectId,
      vendorId: input.vendorId,
      indentId: input.indentId ?? null,
      rfqId: input.rfqId ?? null,
      poDate: ts,
      deliveryDate: input.deliveryDate ?? null,
      deliveryLocationId: input.deliveryLocationId ?? null,
      subtotal: dec(input.subtotal) ?? "0",
      taxAmount: dec(input.taxAmount) ?? "0",
      totalAmount: dec(input.totalAmount) ?? "0",
      paymentTermsDays: input.paymentTermsDays ?? null,
      termsConditionId: input.termsConditionId ?? null,
      remarks: input.remarks ?? null,
      isUrgentLocal: !!input.isUrgentLocal,
      urgentLocalReason: input.urgentLocalReason ?? null,
      status: input.status ?? "draft",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    };
    if (includeDrift) {
      base.deliveryAddress = input.deliveryAddress ?? null;
      base.freightCharges = dec(input.freightCharges);
      base.totalIGST = dec(input.totalIGST);
      base.totalCGST = dec(input.totalCGST);
      base.totalSGST = dec(input.totalSGST);
      base.termsAndConditions = input.termsAndConditions ?? null;
      // Newly-added columns — kept in the same drift bucket so a
      // stale Prisma client falls back to the strip-and-retry
      // + raw-SQL backfill path that already exists below.
      base.purpose = input.purpose ?? null;
      base.otherCharges = dec(input.otherCharges);
      base.contactPerson = input.contactPerson ?? null;
      base.contactMobile = input.contactMobile ?? null;
    }
    return base;
  };

  const buildLines = (includeDrift: boolean) =>
    resolvedLines.map((l) => {
      const row: Record<string, any> = {
        indentLineId: l.indentLineId ?? null,
        itemId: l.itemId,
        uomId: l.uomIdResolved,
        quantity: String(l._qty),
        orderedQty: String(l._qty),
        pendingQty: String(l._qty),
        unitRate: dec(l.unitRate) ?? "0",
        amount: String(l._amount),
        gstCodeId: null,
        taxAmount: String(l._tax),
        totalAmount: String(l._total),
        deliveryDate: parseDate(l.deliveryDate) ?? null,
        remarks: l.remarks ?? null,
      };
      if (includeDrift) {
        row.gstRate = dec(l.gstRate);
        row.igstAmount = String(l._igst);
        row.cgstAmount = String(l._cgst);
        row.sgstAmount = String(l._sgst);
        row.specification = l.specification ?? null;
      }
      return row;
    });

  let created: any;
  let needsRawBackfill = false;
  try {
    created = await (db as any).cnPurchaseOrder.create({
      data: {
        ...buildHeader(true),
        lines: { create: buildLines(true) },
      },
      include: {
        lines: true,
        project: { select: { id: true, name: true, code: true } },
        vendor: {
          select: {
            id: true,
            name: true,
            companyName: true,
            gstin: true,
            state: true,
          },
        },
      },
    });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    const isDrift =
      msg.includes("Unknown argument") &&
      (msg.includes("freightCharges") ||
        msg.includes("totalIGST") ||
        msg.includes("totalCGST") ||
        msg.includes("totalSGST") ||
        msg.includes("deliveryAddress") ||
        msg.includes("termsAndConditions") ||
        msg.includes("gstRate") ||
        msg.includes("igstAmount") ||
        msg.includes("cgstAmount") ||
        msg.includes("sgstAmount") ||
        msg.includes("specification"));
    if (isDrift) {
      console.warn(
        "[po-repository] Prisma client missing new PO columns — " +
          "creating without them and back-filling via raw SQL. " +
          "Run `npx prisma generate` to restore the typed path.",
      );
      created = await (db as any).cnPurchaseOrder.create({
        data: {
          ...buildHeader(false),
          lines: { create: buildLines(false) },
        },
        include: {
          lines: true,
          project: { select: { id: true, name: true, code: true } },
          vendor: {
            select: {
              id: true,
              name: true,
              companyName: true,
              gstin: true,
              state: true,
            },
          },
        },
      });
      needsRawBackfill = true;
    } else {
      throw err;
    }
  }

  // Back-fill the missing columns directly. Header first, then each
  // line row. Done in parallel so it stays snappy.
  if (needsRawBackfill) {
    await (db as any).$executeRaw`
      UPDATE app_quikinfra."Purchase_orders"
      SET "deliveryAddress"    = ${input.deliveryAddress ?? null},
          "freightCharges"     = ${dec(input.freightCharges)}::numeric,
          "totalIGST"          = ${dec(input.totalIGST)}::numeric,
          "totalCGST"          = ${dec(input.totalCGST)}::numeric,
          "totalSGST"          = ${dec(input.totalSGST)}::numeric,
          "termsAndConditions" = ${input.termsAndConditions ?? null},
          "purpose"            = ${input.purpose ?? null},
          "otherCharges"       = ${dec(input.otherCharges)}::numeric,
          "contactPerson"      = ${input.contactPerson ?? null},
          "contactMobile"      = ${input.contactMobile ?? null}
      WHERE id = ${created.id}
    `;
    await Promise.all(
      (created.lines ?? []).map((row: any, idx: number) => {
        const l = resolvedLines[idx];
        if (!l) return null;
        return (db as any).$executeRaw`
          UPDATE app_quikinfra."Purchase_order_lines"
          SET "gstRate"       = ${dec(l.gstRate)}::numeric,
              "igstAmount"    = ${String(l._igst)}::numeric,
              "cgstAmount"    = ${String(l._cgst)}::numeric,
              "sgstAmount"    = ${String(l._sgst)}::numeric,
              "specification" = ${l.specification ?? null}
          WHERE id = ${row.id}
        `;
      }),
    );
  }

  const { itemById, uomById } = await loadLineLookups([created]);
  await augmentPOsWithDriftFields([created]);
  return enrichPO(created, itemById, uomById);
}

export async function updatePOStatus(
  orgId: string,
  id: string,
  status: string,
  updatedBy: string,
  extras?: { approvalId?: string | null },
): Promise<any | null> {
  const existing = await (db as any).cnPurchaseOrder.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;
  await (db as any).cnPurchaseOrder.update({
    where: { id },
    data: {
      status,
      updatedBy,
      ...(extras?.approvalId !== undefined
        ? { approvalId: extras.approvalId }
        : {}),
    },
  });
  return findPOById(orgId, id);
}

export async function softDeletePO(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnPurchaseOrder.updateMany({
    where: { id, orgId },
    data: { status: "cancelled", updatedBy },
  });
  return res.count > 0;
}
