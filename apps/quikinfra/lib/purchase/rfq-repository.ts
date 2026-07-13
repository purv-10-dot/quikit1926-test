/**
 * RFQ repository — Postgres-backed via Prisma.
 *
 * Storage:
 *   - cn_rfqs          (header + buyer contact + status + approvalId)
 *   - cn_rfq_lines     (material lines)
 *   - cn_rfq_vendors   (per-vendor fan-out with assignedItemIds)
 *
 * Enrichment: items/UOMs/vendors pulled from Prisma with a demo-store
 * fallback for legacy ids (same pattern as the indent repository).
 */

import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { findVendorsByIds } from "@/lib/masters/vendors-repository";

// ─── Types ─────────────────────────────────────────────────────────

export interface RfqLineInput {
  itemId: string;
  uomId?: string | null;
  uomCode?: string | null;
  quantity: string | number;
  specification?: string | null;
  sourceIndentLineId?: string | null;
}

export interface RfqVendorInput {
  vendorId: string;
  email?: string | null;
  vendorName?: string | null;
  assignedItemIds?: string[];
}

export interface CreateRfqInput {
  orgId: string;
  rfqNumber: string;
  projectId: string;
  sourceIndentId?: string | null;
  sourceIndentNumber?: string | null;
  rfqDate: Date;
  dueDate?: Date | null;
  purpose?: string | null;
  contactPerson?: string | null;
  contactMobile?: string | null;
  address?: string | null;
  termsTemplateId?: string | null;
  status?: string;
  createdBy: string;
  lines: RfqLineInput[];
  vendors: RfqVendorInput[];
}

export interface ListRfqsOptions {
  orgId: string;
  projectIds?: string[] | null;
  status?: string;
  projectId?: string;
  sourceIndentId?: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

// ─── UOM resolver (create-on-miss to keep saves non-blocking) ──────

async function resolveUomId(
  orgId: string,
  input: { uomId?: string | null; uomCode?: string | null },
  createdBy: string,
): Promise<string | null> {
  if (input.uomId) {
    const row = await db.cnUOM.findFirst({
      where: { id: input.uomId, orgId },
      select: { id: true },
    });
    if (row) return row.id;
  }
  const code = String(input.uomCode ?? "").trim().toUpperCase();
  if (!code) return null;
  const existing = await db.cnUOM.findFirst({
    where: { orgId, code },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db.cnUOM.create({
    data: {
      orgId,
      code,
      name: code,
      createdBy,
      updatedBy: createdBy,
    },
    select: { id: true },
  });
  return created.id;
}

// ─── Enrichment ────────────────────────────────────────────────────

/** A money/quantity value as it arrives from Prisma (Decimal) or raw SQL. */
type Numericish = Prisma.Decimal | number | string | null | undefined;

interface ItemLookup {
  code?: string | null;
  name?: string | null;
  standardRate?: Numericish;
}
interface UomLookup {
  code?: string | null;
  name?: string | null;
}
interface VendorLookup {
  companyName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}
interface ProjectLookup {
  name?: string | null;
  code?: string | null;
}
interface RfqLineRow {
  id: string;
  itemId: string;
  uomId?: string | null;
  quantity?: Numericish;
  specification?: string | null;
  sourceIndentLineId?: string | null;
}
interface RfqVendorRow {
  id: string;
  vendorId: string;
  vendorName?: string | null;
  email?: string | null;
  assignedItemIds?: unknown;
  quotedRates?: unknown;
  sentAt?: Date | null;
  respondedAt?: Date | null;
  quoteRemarks?: string | null;
  quotedAt?: Date | null;
}
interface RfqRow {
  id: string;
  orgId: string;
  rfqNumber: string;
  projectId?: string | null;
  lines?: RfqLineRow[] | null;
  vendors?: RfqVendorRow[] | null;
  sourceIndentId?: string | null;
  sourceIndentNumber?: string | null;
  rfqDate?: Date | string | null;
  dueDate?: Date | string | null;
  purpose?: string | null;
  contactPerson?: string | null;
  contactMobile?: string | null;
  address?: string | null;
  termsTemplateId?: string | null;
  status: string;
  approvalId?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

async function loadLookups(
  orgId: string,
  rows: RfqRow[],
): Promise<{
  itemById: Map<string, ItemLookup>;
  uomById: Map<string, UomLookup>;
  vendorById: Map<string, VendorLookup>;
  projectById: Map<string, ProjectLookup>;
}> {
  const itemIds = new Set<string>();
  const uomIds = new Set<string>();
  const vendorIds = new Set<string>();
  const projectIds = new Set<string>();
  for (const r of rows) {
    if (r.projectId) projectIds.add(r.projectId);
    for (const l of r.lines ?? []) {
      if (l.itemId) itemIds.add(l.itemId);
      if (l.uomId) uomIds.add(l.uomId);
    }
    for (const v of r.vendors ?? []) {
      if (v.vendorId) vendorIds.add(v.vendorId);
    }
  }
  const [items, uoms, vendorMap, projects] = await Promise.all([
    itemIds.size
      ? db.cnItem.findMany({
          where: { id: { in: Array.from(itemIds) } },
          select: { id: true, code: true, name: true, standardRate: true },
        })
      : Promise.resolve([]),
    uomIds.size
      ? db.cnUOM.findMany({
          where: { id: { in: Array.from(uomIds) } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    vendorIds.size
      ? findVendorsByIds(orgId, Array.from(vendorIds))
      : Promise.resolve(new Map()),
    // Postgres-backed project lookup. demo-store's resolveProject misses
    // every DB-only project, leaving projectName/projectCode blank in
    // RFQ lists.
    projectIds.size
      ? db.cnProject.findMany({
          where: { id: { in: Array.from(projectIds) } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    itemById: new Map<string, ItemLookup>(items.map((i) => [i.id, i])),
    uomById: new Map<string, UomLookup>(uoms.map((u) => [u.id, u])),
    vendorById: vendorMap as Map<string, VendorLookup>,
    projectById: new Map<string, ProjectLookup>(projects.map((p) => [p.id, p])),
  };
}

function enrichLine(
  line: RfqLineRow,
  itemById: Map<string, ItemLookup>,
  uomById: Map<string, UomLookup>,
) {
  const item = itemById.get(line.itemId);
  const uom = line.uomId ? uomById.get(line.uomId) : null;
  const qty = line.quantity?.toString?.() ?? String(line.quantity ?? "0");
  return {
    lineId: line.id,
    id: line.id,
    itemId: line.itemId,
    itemCode: item?.code ?? "",
    itemName: item?.name ?? "",
    uomId: line.uomId ?? null,
    uomCode: uom?.code ?? "",
    quantity: qty,
    // Back-compat alias — some list columns read `qtyRequested`.
    qtyRequested: qty,
    specification: line.specification ?? "",
    sourceIndentLineId: line.sourceIndentLineId ?? null,
    standardRate: item?.standardRate?.toString?.() ?? null,
  };
}

function enrichVendor(
  v: RfqVendorRow,
  vendorById: Map<string, VendorLookup>,
) {
  const master = vendorById.get(v.vendorId);
  // `assignedItemIds` is stored as Json in Postgres — Prisma returns
  // it as the underlying array. Guard against unexpected shapes so
  // the list page never crashes on legacy rows.
  const assignedItemIds: string[] = Array.isArray(v.assignedItemIds)
    ? v.assignedItemIds.filter((x): x is string => typeof x === "string")
    : [];
  // `quotedRates` is `[{ lineId, rate, remarks? }]` per the Add Quote
  // modal contract. We pass it through verbatim — readers cope with
  // missing rows for unquoted lines.
  const quotedRates: Array<{ lineId: string; rate: string; remarks?: string }> =
    Array.isArray(v.quotedRates)
      ? v.quotedRates.filter(
          (q): q is { lineId: string; rate: string; remarks?: string } =>
            !!q && typeof (q as { lineId?: unknown }).lineId === "string",
        )
      : [];
  return {
    id: v.id,
    vendorId: v.vendorId,
    vendorName:
      v.vendorName || master?.companyName || master?.name || "",
    email: v.email ?? master?.email ?? "",
    phone: master?.phone ?? "",
    assignedItemIds,
    sentAt: v.sentAt?.toISOString?.() ?? null,
    respondedAt: v.respondedAt?.toISOString?.() ?? null,
    quotedRates,
    quoteRemarks: v.quoteRemarks ?? "",
    quotedAt: v.quotedAt?.toISOString?.() ?? null,
  };
}

function enrichRfq(
  row: RfqRow,
  itemById: Map<string, ItemLookup>,
  uomById: Map<string, UomLookup>,
  vendorById: Map<string, VendorLookup>,
  projectById: Map<string, ProjectLookup> = new Map(),
) {
  const project = row.projectId
    ? projectById.get(row.projectId) ?? null
    : null;
  const lines = (row.lines ?? []).map((l) => enrichLine(l, itemById, uomById));
  const vendors = (row.vendors ?? []).map((v) => enrichVendor(v, vendorById));
  return {
    id: row.id,
    orgId: row.orgId,
    rfqNumber: row.rfqNumber,
    projectId: row.projectId,
    projectName: project?.name ?? "",
    projectCode: project?.code ?? "SITE",
    sourceIndentId: row.sourceIndentId ?? null,
    sourceIndentNumber: row.sourceIndentNumber ?? "",
    rfqDate:
      row.rfqDate instanceof Date
        ? row.rfqDate.toISOString().split("T")[0]
        : String(row.rfqDate ?? "").slice(0, 10),
    dueDate:
      row.dueDate instanceof Date
        ? row.dueDate.toISOString().split("T")[0]
        : (row.dueDate ?? null),
    purpose: row.purpose ?? "",
    contactPerson: row.contactPerson ?? "",
    contactMobile: row.contactMobile ?? "",
    address: row.address ?? "",
    termsTemplateId: row.termsTemplateId ?? null,
    status: row.status,
    approvalId: row.approvalId ?? null,
    lineCount: lines.length,
    lines,
    vendors,
    vendorIds: vendors.map((v) => v.vendorId),
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    createdBy: row.createdBy ?? "",
    updatedBy: row.updatedBy ?? "",
  };
}

/** The enriched, client-facing RFQ shape returned by every public read/write. */
export type EnrichedRfq = ReturnType<typeof enrichRfq>;

/**
 * Backfill the vendor rows' quote fields (`quotedRates`, `quoteRemarks`,
 * `quotedAt`) from the live DB when the Prisma client is stale and
 * silently omits them from SELECT. Mutates the rows in place and is a
 * no-op once the client is regenerated (the field is already defined
 * on at least one row, so we short-circuit).
 */
/**
 * Backfill RFQ-level columns the stale Prisma client dropped from the
 * SELECT (`address`, `termsTemplateId`). Same short-circuit pattern as
 * the vendor helper below.
 */
async function augmentRfqsWithDriftFields(
  rfqRows: Array<{ id: string; address?: unknown; termsTemplateId?: unknown }>,
): Promise<void> {
  if (rfqRows.length === 0) return;
  if ("address" in rfqRows[0]) return; // already present → client is fresh

  try {
    const ids = rfqRows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return;
    const rows: Array<{
      id: string;
      address: string | null;
      termsTemplateId: string | null;
    }> = await db.$queryRaw`
      SELECT id, "address", "termsTemplateId"
      FROM app_quikinfra."Rfqs"
      WHERE id = ANY(${ids})
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of rfqRows) {
      const hit = byId.get(r.id);
      if (!hit) continue;
      r.address = hit.address;
      r.termsTemplateId = hit.termsTemplateId;
    }
  } catch (err: unknown) {
    console.warn(
      "[rfq-repository] augmentRfqsWithDriftFields raw SQL failed:",
      toErrorMessage(err),
    );
  }
}

async function augmentVendorsWithQuoteFields(
  rfqRows: Array<{
    vendors?: Array<{
      id: string;
      quotedRates?: unknown;
      quoteRemarks?: unknown;
      quotedAt?: unknown;
    }>;
  }>,
): Promise<void> {
  const vendorIds: string[] = [];
  for (const r of rfqRows) {
    for (const v of r?.vendors ?? []) {
      if (v?.id) vendorIds.push(v.id);
    }
  }
  if (vendorIds.length === 0) return;

  // Short-circuit: if Prisma already returned the field on the first
  // vendor, the client is up-to-date and no raw-SQL backfill is needed.
  const firstVendor = rfqRows.find((r) => (r?.vendors ?? []).length > 0)
    ?.vendors?.[0];
  if (firstVendor && "quotedRates" in firstVendor) return;

  try {
    const rows: Array<{
      id: string;
      quotedRates: unknown;
      quoteRemarks: string | null;
      quotedAt: Date | null;
    }> = await db.$queryRaw`
      SELECT id, "quotedRates", "quoteRemarks", "quotedAt"
      FROM app_quikinfra."Rfq_vendors"
      WHERE id = ANY(${vendorIds})
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const r of rfqRows) {
      for (const v of r?.vendors ?? []) {
        const hit = byId.get(v.id);
        if (!hit) continue;
        v.quotedRates = hit.quotedRates;
        v.quoteRemarks = hit.quoteRemarks;
        v.quotedAt = hit.quotedAt;
      }
    }
  } catch (err: unknown) {
    // Never block the list — log and leave the new fields undefined.
    // The UI treats missing `quotedRates` as "pending", which is the
    // correct fallback when the DB query itself fails for any reason.
    console.warn(
      "[rfq-repository] augmentVendorsWithQuoteFields raw SQL failed:",
      toErrorMessage(err),
    );
  }
}

// ─── Queries ───────────────────────────────────────────────────────

export async function listRfqs(opts: ListRfqsOptions): Promise<EnrichedRfq[]> {
  const where: Record<string, unknown> = { orgId: opts.orgId };
  if (opts.status && opts.status !== "all") where.status = opts.status;
  if (opts.projectId) where.projectId = opts.projectId;
  if (opts.sourceIndentId) where.sourceIndentId = opts.sourceIndentId;
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
      { rfqNumber: { contains: q, mode: "insensitive" } },
      { sourceIndentNumber: { contains: q, mode: "insensitive" } },
      { purpose: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await db.cnRfq.findMany({
    where,
    include: { lines: true, vendors: true },
    orderBy: { rfqDate: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  await augmentRfqsWithDriftFields(rows);
  await augmentVendorsWithQuoteFields(rows);
  const { itemById, uomById, vendorById, projectById } = await loadLookups(opts.orgId, rows);
  return rows.map((r) => enrichRfq(r, itemById, uomById, vendorById, projectById));
}

export async function findRfqById(
  orgId: string,
  id: string,
): Promise<EnrichedRfq | null> {
  const row = await db.cnRfq.findFirst({
    where: { id, orgId },
    include: { lines: true, vendors: true },
  });
  if (!row) return null;
  await augmentRfqsWithDriftFields([row]);
  await augmentVendorsWithQuoteFields([row]);
  const { itemById, uomById, vendorById, projectById } = await loadLookups(orgId, [row]);
  return enrichRfq(row, itemById, uomById, vendorById, projectById);
}

// ─── Mutations ─────────────────────────────────────────────────────

export async function createRfq(input: CreateRfqInput): Promise<EnrichedRfq> {
  // Resolve uomId per line BEFORE the txn so UOM create-on-miss
  // doesn't inflate the main transaction.
  const resolvedLines: Array<RfqLineInput & { uomIdResolved: string | null }> = [];
  for (const line of input.lines) {
    const uomId = await resolveUomId(
      input.orgId,
      { uomId: line.uomId ?? null, uomCode: line.uomCode ?? null },
      input.createdBy,
    );
    resolvedLines.push({ ...line, uomIdResolved: uomId });
  }

  // Build the create payload. `termsTemplateId` is a recently-added column;
  // on dev setups where `prisma generate` hasn't run since schema.prisma
  // picked it up, the compiled client rejects the argument. We retry
  // without the field in that case — the column on disk accepts NULL.
  const buildData = (includeTerms: boolean) => ({
    orgId: input.orgId,
    rfqNumber: input.rfqNumber,
    projectId: input.projectId,
    sourceIndentId: input.sourceIndentId ?? null,
    sourceIndentNumber: input.sourceIndentNumber ?? null,
    rfqDate: input.rfqDate,
    dueDate: input.dueDate ?? null,
    purpose: input.purpose ?? null,
    contactPerson: input.contactPerson ?? null,
    contactMobile: input.contactMobile ?? null,
    ...(includeTerms ? { termsTemplateId: input.termsTemplateId ?? null } : {}),
    ...(includeTerms ? { address: input.address ?? null } : {}),
    status: input.status ?? "draft",
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
    lines: {
      create: resolvedLines.map((l) => ({
        itemId: l.itemId,
        uomId: l.uomIdResolved,
        quantity: String(l.quantity ?? "0"),
        specification: l.specification ?? null,
        sourceIndentLineId: l.sourceIndentLineId ?? null,
      })),
    },
    vendors: {
      create: (input.vendors ?? []).map((v) => ({
        vendorId: v.vendorId,
        email: v.email ?? null,
        vendorName: v.vendorName ?? null,
        assignedItemIds: Array.isArray(v.assignedItemIds)
          ? v.assignedItemIds
          : [],
      })),
    },
  });

  let row: RfqRow;
  let needsRawBackfill = false;
  try {
    row = await db.cnRfq.create({
      data: buildData(true),
      include: { lines: true, vendors: true },
    });
  } catch (err: unknown) {
    const msg = toErrorMessage(err, "");
    if (
      msg.includes("Unknown argument `termsTemplateId`") ||
      msg.includes("Unknown argument `address`")
    ) {
      console.warn(
        "[rfq-repository] Prisma client missing new RFQ columns — run " +
          "`npx prisma generate` to restore the typed path. Saving " +
          "core fields now and back-filling via raw SQL.",
      );
      row = await db.cnRfq.create({
        data: buildData(false),
        include: { lines: true, vendors: true },
      });
      needsRawBackfill = true;
    } else {
      throw err;
    }
  }

  // Back-fill the columns the stale client dropped so they still
  // persist in Postgres. The columns exist in the DB (confirmed by
  // `prisma db push`), Prisma just doesn't know about them yet.
  if (needsRawBackfill) {
    await db.$executeRaw`
      UPDATE app_quikinfra."Rfqs"
      SET "termsTemplateId" = ${input.termsTemplateId ?? null},
          "address"         = ${input.address ?? null}
      WHERE id = ${row.id}
    `;
    row.termsTemplateId = input.termsTemplateId ?? null;
    row.address = input.address ?? null;
  }
  const { itemById, uomById, vendorById, projectById } = await loadLookups(
    input.orgId,
    [row],
  );
  return enrichRfq(row, itemById, uomById, vendorById, projectById);
}

export async function updateRfqStatus(
  orgId: string,
  id: string,
  status: string,
  updatedBy: string,
  extras?: { approvalId?: string | null },
): Promise<EnrichedRfq | null> {
  const existing = await db.cnRfq.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;
  await db.cnRfq.update({
    where: { id },
    data: {
      status,
      updatedBy,
      ...(extras?.approvalId !== undefined
        ? { approvalId: extras.approvalId }
        : {}),
    },
  });
  return findRfqById(orgId, id);
}

export interface SaveQuoteInput {
  orgId: string;
  rfqId: string;
  vendorRowId: string;
  rates: Array<{ lineId: string; rate: string }>;
  remarks?: string | null;
  updatedBy: string;
}

/**
 * Persist a vendor's quoted rates against an RFQ. Mutates the
 * `cn_rfq_vendors` row in-place — one row per vendor per RFQ — and
 * also bumps the parent RFQ status to `quoted` once every assigned
 * vendor has at least one rate on record.
 */
export async function saveVendorQuote(
  input: SaveQuoteInput,
): Promise<EnrichedRfq | null> {
  const vendorRow = await db.cnRfqVendor.findFirst({
    where: { id: input.vendorRowId, rfqId: input.rfqId },
    select: { id: true },
  });
  if (!vendorRow) return null;

  // Drop empty / zero rates so the badge logic stays honest — a row
  // with `rate: "0"` would otherwise count as "quoted" and skew the
  // comparison view.
  const cleanRates = (input.rates ?? [])
    .map((r) => ({
      lineId: String(r.lineId ?? "").trim(),
      rate: String(r.rate ?? "").trim(),
    }))
    .filter((r) => r.lineId && r.rate && parseFloat(r.rate) > 0);

  const ts = cleanRates.length ? new Date() : null;

  // Write through Prisma when the client knows about quote fields; if
  // the generated client is stale (common in dev before `prisma
  // generate` is re-run), fall through to raw SQL against the same
  // columns so saves keep working.
  try {
    await db.cnRfqVendor.update({
      where: { id: input.vendorRowId },
      data: {
        quotedRates: cleanRates,
        quoteRemarks: input.remarks ?? null,
        quotedAt: ts,
        respondedAt: ts,
      },
    });
  } catch (err: unknown) {
    const msg = toErrorMessage(err, "");
    if (
      msg.includes("Unknown argument") ||
      msg.includes("quotedRates") ||
      msg.includes("quoteRemarks") ||
      msg.includes("quotedAt")
    ) {
      console.warn(
        "[rfq.saveVendorQuote] Prisma client missing quote fields — " +
          "using raw SQL. Run `npx prisma generate` to restore typed path.",
      );
      await db.$executeRaw`
        UPDATE app_quikinfra."Rfq_vendors"
        SET "quotedRates"  = ${JSON.stringify(cleanRates)}::jsonb,
            "quoteRemarks" = ${input.remarks ?? null},
            "quotedAt"     = ${ts},
            "respondedAt"  = ${ts}
        WHERE id = ${input.vendorRowId}
      `;
    } else {
      throw err;
    }
  }

  // Status bump: only when every vendor on the RFQ has quoted at
  // least one rate. Same schema-drift dance as above.
  let all: Array<{ quotedRates: unknown }> = [];
  try {
    all = await db.cnRfqVendor.findMany({
      where: { rfqId: input.rfqId },
      select: { quotedRates: true },
    });
  } catch (err: unknown) {
    const msg = toErrorMessage(err, "");
    if (msg.includes("Unknown argument") || msg.includes("quotedRates")) {
      all = await db.$queryRaw`
        SELECT "quotedRates" FROM app_quikinfra."Rfq_vendors" WHERE "rfqId" = ${input.rfqId}
      `;
    } else {
      throw err;
    }
  }
  const allQuoted =
    all.length > 0 &&
    all.every(
      (v) => Array.isArray(v.quotedRates) && v.quotedRates.length > 0,
    );
  if (allQuoted) {
    await db.cnRfq.update({
      where: { id: input.rfqId },
      data: { status: "quoted", updatedBy: input.updatedBy },
    });
  }

  return findRfqById(input.orgId, input.rfqId);
}

export async function softDeleteRfq(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnRfq.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
