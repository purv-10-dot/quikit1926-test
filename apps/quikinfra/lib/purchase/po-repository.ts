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

import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import type { POLineInput, CreatePOInput } from "./po-repo-types";
export type { POLineInput, CreatePOInput };

function dec(n: string | number | null | undefined): string | null {
  if (n === null || n === undefined || n === "") return null;
  const s = String(n).trim();
  if (s === "") return null;
  const f = parseFloat(s);
  if (!Number.isFinite(f)) return null;
  return s;
}

function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    return (d as Date).toISOString().slice(0, 10);
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
    const row = await db.cnUOM.findFirst({
      where: { orgId, code },
      select: { id: true },
    });
    return row?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Shape enrichment (compatible with legacy demo-store readers) ──

/** A money/quantity value as it arrives from Prisma (Decimal) or raw SQL. */
type Numericish = Prisma.Decimal | number | string | null | undefined;

interface ItemLookup {
  code?: string | null;
  name?: string | null;
  hsnCode?: string | null;
}
interface UomLookup {
  code?: string | null;
}
interface PoLineRow {
  id: string;
  itemId?: string | null;
  uomId?: string | null;
  orderedQty?: Numericish;
  quantity?: Numericish;
  receivedQty?: Numericish;
  pendingQty?: Numericish;
  unitRate?: Numericish;
  amount?: Numericish;
  taxAmount?: Numericish;
  totalAmount?: Numericish;
  igstAmount?: Numericish;
  cgstAmount?: Numericish;
  sgstAmount?: Numericish;
  gstRate?: Numericish;
  specification?: string | null;
  deliveryDate?: Date | string | null;
  remarks?: string | null;
  indentLineId?: string | null;
}
interface PoProjectRel {
  name?: string | null;
  code?: string | null;
}
interface PoVendorRel {
  name?: string | null;
  companyName?: string | null;
  gstin?: string | null;
  state?: string | null;
  email?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
}
interface PoRow {
  id: string;
  orgId: string;
  poNumber: string;
  projectId: string;
  vendorId: string;
  lines?: PoLineRow[] | null;
  project?: PoProjectRel | null;
  vendor?: PoVendorRel | null;
  subtotal?: Numericish;
  freightCharges?: Numericish;
  taxAmount?: Numericish;
  totalAmount?: Numericish;
  totalIGST?: Numericish;
  totalCGST?: Numericish;
  totalSGST?: Numericish;
  otherCharges?: Numericish;
  indentId?: string | null;
  rfqId?: string | null;
  poDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  deliveryAddress?: string | null;
  deliveryLocationId?: string | null;
  paymentTermsDays?: number | null;
  termsConditionId?: string | null;
  termsAndConditions?: string | null;
  remarks?: string | null;
  isUrgentLocal?: boolean | null;
  urgentLocalReason?: string | null;
  purpose?: string | null;
  contactPerson?: string | null;
  contactMobile?: string | null;
  status: string;
  approvalId?: string | null;
  approvalThresholdMet?: boolean | null;
  closedAt?: Date | null;
  closedBy?: string | null;
  closeReason?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

function enrichLine(row: PoLineRow, itemById: Map<string, ItemLookup>, uomById: Map<string, UomLookup>) {
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

function enrichPO(row: PoRow, itemById: Map<string, ItemLookup>, uomById: Map<string, UomLookup>) {
  const lines = (row.lines ?? []).map((l) => enrichLine(l, itemById, uomById));
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
    vendorName: vendor?.name || vendor?.companyName || "",
    vendorGSTIN: vendor?.gstin ?? "",
    vendorState: vendor?.state ?? "",
    vendorEmail: vendor?.email ?? "",
    vendorPhone: vendor?.phone ?? "",
    vendorContactPerson: vendor?.contactPerson ?? "",
    vendorAddress:
      [vendor?.address, vendor?.city, vendor?.state, vendor?.pincode]
        .filter((x) => x && String(x).trim())
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
    isRCM: lines.some((l) => l.isRCM),
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
    createdBy: row.createdBy ?? "",
    updatedBy: row.updatedBy ?? "",
  };
}

/** The enriched, client-facing PO shape returned by every public read/write. */
export type EnrichedPO = ReturnType<typeof enrichPO>;

// ─── Drift backfill (same pattern as rfq-repository) ──────────────

async function augmentPOsWithDriftFields(
  poRows: Array<{
    id: string;
    freightCharges?: unknown;
    totalIGST?: unknown;
    totalCGST?: unknown;
    totalSGST?: unknown;
    deliveryAddress?: unknown;
    termsAndConditions?: unknown;
    purpose?: unknown;
    otherCharges?: unknown;
    contactPerson?: unknown;
    contactMobile?: unknown;
    lines?: Array<{
      id: string;
      gstRate?: unknown;
      igstAmount?: unknown;
      cgstAmount?: unknown;
      sgstAmount?: unknown;
      specification?: unknown;
    }> | null;
  }>,
): Promise<void> {
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
    }> = await db.$queryRaw`
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
    }> = await db.$queryRaw`
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
  } catch (err: unknown) {
    console.warn(
      "[po-repository] augmentPOsWithDriftFields raw SQL failed:",
      toErrorMessage(err),
    );
  }
}

// ─── Lookups (items + UOMs in one trip) ────────────────────────────

async function loadLineLookups(
  rows: Array<{
    lines?: Array<{ itemId?: string | null; uomId?: string | null }> | null;
  }>,
): Promise<{ itemById: Map<string, ItemLookup>; uomById: Map<string, UomLookup> }> {
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
      ? db.cnItem.findMany({
          where: { id: { in: Array.from(itemIds) } },
          select: { id: true, code: true, name: true, hsnCode: true },
        })
      : Promise.resolve([]),
    uomIds.size > 0
      ? db.cnUOM.findMany({
          where: { id: { in: Array.from(uomIds) } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
  ]);
  const itemById = new Map<string, ItemLookup>();
  for (const i of items) itemById.set(i.id, i);
  const uomById = new Map<string, UomLookup>();
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
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
  /** Server-side sort (from `parseSort`). Defaults to newest poDate first. */
  orderBy?: Array<Record<string, "asc" | "desc">>;
}

/** Shared where-builder so `listPOs` and `countPOs` filter identically. */
function buildPOsWhere(
  opts: Pick<ListPOsOptions, "orgId" | "projectIds" | "status" | "projectId" | "search" | "fyStart" | "fyEnd">,
): Record<string, unknown> {
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
  return where;
}

export async function countPOs(
  opts: Pick<ListPOsOptions, "orgId" | "projectIds" | "status" | "projectId" | "search" | "fyStart" | "fyEnd">,
): Promise<number> {
  return db.cnPurchaseOrder.count({ where: buildPOsWhere(opts) });
}

/** Per-status row counts for the list tab badges (one groupBy over the same
 *  filters, ignoring the status filter itself). */
export async function poStatusCounts(
  opts: Pick<ListPOsOptions, "orgId" | "projectIds" | "projectId" | "search" | "fyStart" | "fyEnd">,
): Promise<Record<string, number>> {
  const groups = await db.cnPurchaseOrder.groupBy({
    by: ["status"],
    where: buildPOsWhere({ ...opts, status: undefined }),
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of groups) out[String(g.status)] = g._count._all;
  return out;
}

export async function listPOs(opts: ListPOsOptions): Promise<EnrichedPO[]> {
  const where = buildPOsWhere(opts);

  const rows = await db.cnPurchaseOrder.findMany({
    where,
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
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
    // Newest first. `createdAt` is the tiebreaker so POs raised on the
    // same poDate still order by when they were actually created — without
    // it, same-date POs fall back to arbitrary insertion order and a
    // freshly-created PO can land below older ones.
    orderBy: opts.orderBy ?? [{ poDate: "desc" }, { createdAt: "desc" }],
  });
  await augmentPOsWithDriftFields(rows);
  await hydrateCloseFields(rows);
  const { itemById, uomById } = await loadLineLookups(rows);
  const enriched = rows.map((r) => enrichPO(r, itemById, uomById));
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
async function hydrateCloseFields(
  rows: Array<{
    id: string;
    closedAt?: unknown;
    closedBy?: unknown;
    closeReason?: unknown;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  // Only hit the DB when the typed client didn't return the field —
  // once the server is restarted and Prisma regenerates, this becomes
  // a no-op.
  const needsHydration = rows.some((r) => r.closedAt === undefined);
  if (!needsHydration) return;
  const ids = rows.map((r) => r.id);
  const closeRows = await db.$queryRawUnsafe<
    Array<{
      id: string;
      closedAt: Date | string | null;
      closedBy: string | null;
      closeReason: string | null;
    }>
  >(
    `SELECT id, "closedAt", "closedBy", "closeReason"
       FROM app_quikinfra."Purchase_orders"
      WHERE id = ANY($1::text[])`,
    ids,
  );
  const byId = new Map(closeRows.map((r) => [r.id, r]));
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
  enrichedRows: Array<{
    sourceIndentId?: string | null;
    sourceRfqId?: string | null;
    sourceIndentNumber?: string | null;
    sourceRfqNumber?: string | null;
  }>,
  rawRows: Array<{ indentId?: string | null; rfqId?: string | null }>,
): Promise<void> {
  const indentIds = new Set<string>();
  const rfqIds = new Set<string>();
  for (const r of rawRows) {
    if (r.indentId) indentIds.add(r.indentId);
    if (r.rfqId) rfqIds.add(r.rfqId);
  }
  const [indentRows, rfqRows] = await Promise.all([
    indentIds.size
      ? db.cnPurchaseIndent.findMany({
          where: { id: { in: Array.from(indentIds) } },
          select: { id: true, indentNumber: true },
        })
      : Promise.resolve([] as Array<{ id: string; indentNumber: string }>),
    rfqIds.size
      ? db.cnRfq.findMany({
          where: { id: { in: Array.from(rfqIds) } },
          select: { id: true, rfqNumber: true },
        })
      : Promise.resolve([] as Array<{ id: string; rfqNumber: string }>),
  ]);
  const indentNumById = new Map<string, string>(
    indentRows.map((i) => [i.id, i.indentNumber]),
  );
  const rfqNumById = new Map<string, string>(
    rfqRows.map((i) => [i.id, i.rfqNumber]),
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

export async function findPOById(orgId: string, id: string): Promise<EnrichedPO | null> {
  const row = await db.cnPurchaseOrder.findFirst({
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

export async function createPO(input: CreatePOInput): Promise<EnrichedPO> {
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
  const buildHeader = (includeDrift: boolean): Record<string, unknown> => {
    const base: Record<string, unknown> = {
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
      const row: Record<string, unknown> = {
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

  let created: PoRow;
  let needsRawBackfill = false;
  try {
    created = await db.cnPurchaseOrder.create({
      data: {
        ...buildHeader(true),
        lines: { create: buildLines(true) },
      } as unknown as Prisma.CnPurchaseOrderUncheckedCreateInput,
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
  } catch (err: unknown) {
    const msg = toErrorMessage(err, "");
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
      created = await db.cnPurchaseOrder.create({
        data: {
          ...buildHeader(false),
          lines: { create: buildLines(false) },
        } as unknown as Prisma.CnPurchaseOrderUncheckedCreateInput,
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
    await db.$executeRaw`
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
      (created.lines ?? []).map((row, idx: number) => {
        const l = resolvedLines[idx];
        if (!l) return null;
        return db.$executeRaw`
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
): Promise<EnrichedPO | null> {
  const existing = await db.cnPurchaseOrder.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;
  await db.cnPurchaseOrder.update({
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
  const res = await db.cnPurchaseOrder.updateMany({
    where: { id, orgId },
    data: { status: "cancelled", updatedBy },
  });
  return res.count > 0;
}
