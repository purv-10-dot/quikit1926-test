/**
 * Purchase Indent repository — Postgres-backed via Prisma.
 *
 * Mirrors the PR repository: Prisma owns CRUD, enrichment at read-time
 * derives the fat UI shape (project name, item code/name, uom code,
 * vendor name, qtyOpen, lineStatus, etc.) so the list/detail pages
 * don't need to change.
 *
 * Schema-drift tolerant: columns that are declared in schema.prisma but
 * not yet present in the generated client or the DB are stripped and
 * the save retried, so the app keeps working until
 * `npx prisma db push` + `npx prisma generate` have run.
 */

import { toErrorMessage, getErrorCode , getErrorMeta} from "@/lib/api/errors";
import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

// ─── Types ──────────────────────────────────────────────────────────

export interface IndentLineInput {
  itemId: string;
  uomId?: string | null;
  uomCode?: string | null;
  prLineId?: string | null;
  requiredQty?: string | number;
  indentedQty?: string | number;
  qtyRequested?: string | number;
  estimatedRate?: string | number | null;
  estimatedAmount?: string | number | null;
  preferredVendorId?: string | null;
  qualitySpec?: string | null;
  lineStatus?: string | null;
  remarks?: string | null;
}

export interface CreateIndentInput {
  orgId: string;
  indentNumber: string;
  prId?: string | null;
  sourceMrNumber?: string | null;
  projectId: string;
  requestedById: string;
  indentDate: Date;
  requiredDate?: Date | null;
  isUrgent?: boolean;
  directIndentReason?: string | null;
  estimatedTotal?: string | number | null;
  status?: string;
  approvalId?: string | null;
  createdBy: string;
  lines: IndentLineInput[];
}


export interface ListIndentsOptions {
  orgId: string;
  projectIds?: string[] | null;
  status?: string;
  projectId?: string;
  search?: string;
  /**
   * When set, the result is filtered to indents raised by this user.
   * Used by the workflow-participant visibility rule: viewers whose
   * role isn't configured in the active workflow only see their own.
   */
  ownOnlyForUserId?: string | null;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
  /** Server-side sort (from `parseSort`). Defaults to newest-first. */
  orderBy?: Array<Record<string, "asc" | "desc">>;
}

function buildIndentsWhere(
  opts: Pick<ListIndentsOptions, "orgId" | "projectIds" | "status" | "projectId" | "search" | "ownOnlyForUserId">,
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
  const q = (opts.search ?? "").trim();
  if (q) {
    where.OR = [
      { indentNumber: { contains: q, mode: "insensitive" } },
      { sourceMrNumber: { contains: q, mode: "insensitive" } },
    ];
  }
  if (opts.ownOnlyForUserId) {
    where.requestedById = opts.ownOnlyForUserId;
  }
  return where;
}

export async function countIndents(
  opts: Pick<ListIndentsOptions, "orgId" | "projectIds" | "status" | "projectId" | "search" | "ownOnlyForUserId">,
): Promise<number> {
  return db.cnPurchaseIndent.count({ where: buildIndentsWhere(opts) });
}

export async function indentStatusCounts(
  opts: Pick<ListIndentsOptions, "orgId" | "projectIds" | "projectId" | "search" | "ownOnlyForUserId">,
): Promise<Record<string, number>> {
  const groups = await db.cnPurchaseIndent.groupBy({
    by: ["status"],
    where: buildIndentsWhere({ ...opts, status: undefined }),
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of groups) out[String(g.status)] = g._count._all;
  return out;
}

// ─── Schema-drift strip-and-retry (mirrors pr-repository) ───────────

const STRIPPABLE_INDENT_FIELDS = new Set([
  "requiredDate",
  "isUrgent",
  "directIndentReason",
  "estimatedTotal",
  "sourceMrNumber",
]);
const STRIPPABLE_LINE_FIELDS = new Set([
  "estimatedRate",
  "estimatedAmount",
  "preferredVendorId",
  "qualitySpec",
  "lineStatus",
]);
const loggedMissingFields = new Set<string>();

function extractUnknownArgument(message: string): string | null {
  const m = message.match(/Unknown argument `([^`]+)`/);
  return m?.[1] ?? null;
}
function warnOnceMissing(field: string) {
  if (loggedMissingFields.has(field)) return;
  loggedMissingFields.add(field);
  console.warn(
    `[indent-repository] Prisma field \`${field}\` missing — run ` +
      `\`npx prisma db push && npx prisma generate\`. Saving other fields only.`,
  );
}
function stripFieldDeep(obj: unknown, field: string): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((x) => stripFieldDeep(x, field));
  if (typeof obj === "object" && Object.getPrototypeOf(obj) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === field) continue;
      out[k] = stripFieldDeep(v, field);
    }
    return out;
  }
  return obj;
}
async function withSchemaDriftRetry<T, P extends Record<string, unknown>>(
  buildPayload: () => P,
  run: (payload: P) => Promise<T>,
): Promise<T> {
  let payload = buildPayload();
  for (let i = 0; i < 10; i++) {
    try {
      return await run(payload);
    } catch (err: unknown) {
      const msg = toErrorMessage(err, "");
      let bad: string | null = null;
      if (msg.includes("Unknown argument")) bad = extractUnknownArgument(msg);
      else if (getErrorCode(err) === "P2022") bad = String(getErrorMeta(err)?.column ?? "") || null;
      if (!bad) throw err;
      // Postgres P2022 returns `table.column` (e.g.
      // "cn_purchase_indent_lines.estimatedRate"). Strip the table
      // prefix so the STRIPPABLE_* sets (which hold bare field names)
      // can match.
      const bareBad = bad.includes(".") ? bad.split(".").pop()! : bad;
      if (
        !STRIPPABLE_INDENT_FIELDS.has(bareBad) &&
        !STRIPPABLE_LINE_FIELDS.has(bareBad)
      )
        throw err;
      warnOnceMissing(bareBad);
      payload = stripFieldDeep(payload, bareBad) as P;
    }
  }
  return await run(payload);
}

// ─── UOM resolver (Prisma-first, demo-store fallback) ──────────────

async function resolveUomId(
  orgId: string,
  input: { uomId?: string | null; uomCode?: string | null },
  createdBy: string,
): Promise<string> {
  if (input.uomId) {
    const row = await db.cnUOM.findFirst({
      where: { id: input.uomId, orgId },
      select: { id: true },
    });
    if (row) return row.id;
  }

  const code = String(input.uomCode ?? "").trim().toUpperCase();
  if (!code) throw new Error("UOM is required on every line");

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

// ─── Read-side enrichment ──────────────────────────────────────────

// Prisma schema has no `item`/`uom` relations on CnPurchaseIndentLine —
// only a parent `indent` relation — so we batch-fetch items and UOMs
// separately and pass lookup maps into enrichLine. Avoids a second
// round of schema churn just to add those relations.
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
  name?: string | null;
  companyName?: string | null;
}
interface IndentProjectRel {
  name?: string | null;
  code?: string | null;
}
interface IndentLineRow {
  id: string;
  prLineId?: string | null;
  itemId: string;
  uomId: string;
  requiredQty?: Numericish;
  indentedQty?: Numericish;
  orderedQty?: Numericish;
  pendingQty?: Numericish;
  estimatedRate?: Numericish;
  estimatedAmount?: Numericish;
  preferredVendorId?: string | null;
  qualitySpec?: string | null;
  lineStatus?: string | null;
  remarks?: string | null;
}
interface IndentRow {
  id: string;
  orgId: string;
  indentNumber: string;
  prId?: string | null;
  projectId?: string | null;
  project?: IndentProjectRel | null;
  requestedById?: string | null;
  indentDate?: Date | string | null;
  requiredDate?: Date | null;
  isUrgent?: boolean | null;
  directIndentReason?: string | null;
  estimatedTotal?: Numericish;
  status: string;
  approvalId?: string | null;
  sourceMrNumber?: string | null;
  lines?: IndentLineRow[] | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

async function loadLineLookups(lines: IndentLineRow[], orgId: string): Promise<{
  itemById: Map<string, ItemLookup>;
  uomById: Map<string, UomLookup>;
  vendorById: Map<string, VendorLookup>;
}> {
  const itemIds = Array.from(
    new Set<string>(lines.map((l) => l.itemId).filter(Boolean)),
  );
  const uomIds = Array.from(
    new Set<string>(lines.map((l) => l.uomId).filter(Boolean)),
  );
  const vendorIds = Array.from(
    new Set<string>(
      lines.map((l) => l.preferredVendorId).filter((v): v is string => Boolean(v)),
    ),
  );
  const [items, uoms, vendors] = await Promise.all([
    itemIds.length
      ? db.cnItem.findMany({
          where: { orgId, id: { in: itemIds } },
          // standardRate is pulled so enrichLine can fall back to it
          // when the indent line's estimatedRate wasn't persisted (e.g.
          // rows written before `prisma db push` added the new column).
          select: { id: true, code: true, name: true, standardRate: true },
        })
      : Promise.resolve([]),
    uomIds.length
      ? db.cnUOM.findMany({
          where: { orgId, id: { in: uomIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    vendorIds.length
      ? db.cnVendor.findMany({
          where: { orgId, id: { in: vendorIds } },
          select: { id: true, name: true, companyName: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    itemById: new Map<string, ItemLookup>(items.map((i) => [i.id, i])),
    uomById: new Map<string, UomLookup>(uoms.map((u) => [u.id, u])),
    vendorById: new Map<string, VendorLookup>(vendors.map((v) => [v.id, v])),
  };
}

function enrichLine(
  line: IndentLineRow,
  itemById: Map<string, ItemLookup>,
  uomById: Map<string, UomLookup>,
  vendorById: Map<string, VendorLookup> = new Map(),
) {
  const item = itemById.get(line.itemId);
  const uom = uomById.get(line.uomId);
  const itemName = item?.name ?? "";
  const itemCode = item?.code ?? "";
  const uomCode = uom?.code ?? "";
  const preferredVendor = line.preferredVendorId
    ? (vendorById.get(line.preferredVendorId) ?? null)
    : null;
  const required = line.requiredQty?.toString?.() ?? "0";
  const indented = line.indentedQty?.toString?.() ?? required;
  const ordered = line.orderedQty?.toString?.() ?? "0";
  const pending = line.pendingQty?.toString?.() ?? indented;

  // Rate/amount fallbacks. If the DB row doesn't carry `estimatedRate`
  // (e.g. row written before `prisma db push` added the column and the
  // repository's strip-and-retry dropped it) we fall back to the item
  // master's standardRate and derive the amount from qty × rate so the
  // detail page isn't stuck showing "—".
  const rawRate = line.estimatedRate?.toString?.() ?? "";
  const parsedRate = parseFloat(rawRate) || 0;
  const masterRate =
    parseFloat(item?.standardRate?.toString?.() ?? "0") || 0;
  const effectiveRate = parsedRate > 0 ? parsedRate : masterRate;

  const rawAmount = line.estimatedAmount?.toString?.() ?? "";
  const parsedAmount = parseFloat(rawAmount) || 0;
  const qtyForAmount = parseFloat(indented) || 0;
  const effectiveAmount =
    parsedAmount > 0
      ? parsedAmount
      : Math.round(qtyForAmount * effectiveRate * 100) / 100;

  return {
    lineId: line.id,
    id: line.id,
    prLineId: line.prLineId ?? null,
    itemId: line.itemId,
    itemCode,
    itemName,
    uomId: line.uomId,
    uomCode,
    requiredQty: required,
    indentedQty: indented,
    qtyRequested: indented,
    orderedQty: ordered,
    qtyPORaised: ordered,
    pendingQty: pending,
    qtyOpen: pending,
    estimatedRate: String(effectiveRate),
    estimatedAmount: String(effectiveAmount),
    preferredVendorId: line.preferredVendorId ?? "",
    preferredVendorName: preferredVendor?.companyName ?? "",
    qualitySpec: line.qualitySpec ?? "",
    lineStatus: line.lineStatus ?? "open",
    remarks: line.remarks ?? "",
  };
}

interface PrSelfHealInfo {
  prNumber: string;
  requiredDate: Date | null;
}

/**
 * Batch-lookup PR numbers + required dates for the given prIds. Used
 * to self-heal the denormalised `sourceMrNumber` and `requiredDate`
 * columns on rows saved before those columns existed — strip-and-
 * retry drops them on save, so the list would otherwise show "Direct"
 * and a blank date even though the source PR has both.
 */
async function loadSourcePrInfo(
  prIds: string[],
): Promise<Map<string, PrSelfHealInfo>> {
  const unique = Array.from(new Set(prIds.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const rows = await db.cnPurchaseRequisition.findMany({
    where: { id: { in: unique } },
    select: { id: true, prNumber: true, requiredDate: true },
  });
  return new Map<string, PrSelfHealInfo>(
    rows.map((r) => [
      r.id,
      { prNumber: r.prNumber, requiredDate: r.requiredDate ?? null },
    ]),
  );
}

function enrichIndent(
  row: IndentRow,
  itemById: Map<string, ItemLookup>,
  uomById: Map<string, UomLookup>,
  prInfoById?: Map<string, PrSelfHealInfo>,
  vendorById: Map<string, VendorLookup> = new Map(),
) {
  const projectName = row.project?.name ?? "";
  const projectCode = row.project?.code ?? "SITE";
  const lines = (row.lines ?? []).map((l) =>
    enrichLine(l, itemById, uomById, vendorById),
  );
  // Self-heal sourceMrNumber + requiredDate by falling back to the
  // source PR's values when the denormalised columns are empty (rows
  // saved before `prisma db push` added the new columns).
  const prInfo = row.prId ? prInfoById?.get(row.prId) : undefined;
  const sourceMrNumber =
    (row.sourceMrNumber && String(row.sourceMrNumber)) ||
    (prInfo?.prNumber ?? "") ||
    "";
  const requiredDateRaw = row.requiredDate ?? prInfo?.requiredDate ?? null;
  const requiredDate =
    requiredDateRaw instanceof Date
      ? requiredDateRaw.toISOString().split("T")[0]
      : (requiredDateRaw ?? null);
  return {
    id: row.id,
    orgId: row.orgId,
    indentNumber: row.indentNumber,
    prId: row.prId ?? null,
    // UI list column reads sourceMrNumber/sourceMrId (legacy names).
    sourceMrId: row.prId ?? null,
    sourceMrNumber,
    projectId: row.projectId,
    projectName,
    projectCode,
    requestedById: row.requestedById,
    indentDate:
      row.indentDate instanceof Date
        ? row.indentDate.toISOString().split("T")[0]
        : String(row.indentDate ?? "").slice(0, 10),
    requiredDate,
    isUrgent: !!row.isUrgent,
    directIndentReason: row.directIndentReason ?? "",
    estimatedTotal: row.estimatedTotal?.toString?.() ?? "0",
    status: row.status,
    approvalId: row.approvalId ?? null,
    lineCount: lines.length,
    lines,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    createdBy: row.createdBy ?? "",
    updatedBy: row.updatedBy ?? "",
    // Legacy UI fields the list page still reads — synthesise so the
    // column render functions don't break.
    requestedBy: row.requestedById,
  };
}

/** The enriched, client-facing Indent shape returned by every public read/write. */
export type EnrichedIndent = ReturnType<typeof enrichIndent>;

// ─── Queries ───────────────────────────────────────────────────────

export async function listIndents(opts: ListIndentsOptions): Promise<any[]> {
  const rows = await db.cnPurchaseIndent.findMany({
    where: buildIndentsWhere(opts),
    include: {
      project: { select: { id: true, name: true, code: true } },
      lines: true,
    },
    orderBy: opts.orderBy ?? [{ indentDate: "desc" }, { createdAt: "desc" }],
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  const allLines = rows.flatMap((r) => r.lines ?? []);
  const [{ itemById, uomById, vendorById }, prInfoById] = await Promise.all([
    loadLineLookups(allLines, opts.orgId),
    loadSourcePrInfo(
      rows.map((r) => r.prId).filter((x): x is string => Boolean(x)),
    ),
  ]);
  return rows.map((r) =>
    enrichIndent(r, itemById, uomById, prInfoById, vendorById),
  );
}

export async function findIndentById(
  orgId: string,
  id: string,
): Promise<ReturnType<typeof enrichIndent> | null> {
  const row = await db.cnPurchaseIndent.findFirst({
    where: { id, orgId },
    include: {
      project: { select: { id: true, name: true, code: true } },
      lines: true,
    },
  });
  if (!row) return null;
  const [{ itemById, uomById, vendorById }, prInfoById] = await Promise.all([
    loadLineLookups(row.lines ?? [], orgId),
    loadSourcePrInfo(row.prId ? [row.prId] : []),
  ]);
  return enrichIndent(row, itemById, uomById, prInfoById, vendorById);
}

// ─── Mutations ─────────────────────────────────────────────────────

export async function createIndent(
  input: CreateIndentInput,
): Promise<ReturnType<typeof enrichIndent>> {
  // Resolve uomId for every line before the txn — CnUOM create-on-miss
  // needs its own write, and we don't want to inflate the main txn.
  const resolvedLines: Array<IndentLineInput & { uomIdResolved: string }> = [];
  for (const line of input.lines) {
    const uomId = await resolveUomId(
      input.orgId,
      { uomId: line.uomId ?? null, uomCode: line.uomCode ?? null },
      input.createdBy,
    );
    resolvedLines.push({ ...line, uomIdResolved: uomId });
  }

  const row = await withSchemaDriftRetry(
    () => ({
      orgId: input.orgId,
      indentNumber: input.indentNumber,
      prId: input.prId ?? null,
      sourceMrNumber: input.sourceMrNumber ?? null,
      projectId: input.projectId,
      requestedById: input.requestedById,
      indentDate: input.indentDate,
      requiredDate: input.requiredDate ?? null,
      isUrgent: input.isUrgent ?? false,
      directIndentReason: input.directIndentReason ?? null,
      estimatedTotal:
        input.estimatedTotal !== undefined && input.estimatedTotal !== null
          ? String(input.estimatedTotal)
          : null,
      status: input.status ?? "draft",
      approvalId: input.approvalId ?? null,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      lines: {
        create: resolvedLines.map((l) => {
          const requiredQty = String(
            l.requiredQty ?? l.indentedQty ?? l.qtyRequested ?? "0",
          );
          const indentedQty = String(
            l.indentedQty ?? l.qtyRequested ?? l.requiredQty ?? "0",
          );
          const pending = indentedQty; // orderedQty starts at 0.
          return {
            itemId: l.itemId,
            uomId: l.uomIdResolved,
            prLineId: l.prLineId ?? null,
            requiredQty,
            indentedQty,
            orderedQty: "0",
            pendingQty: pending,
            estimatedRate:
              l.estimatedRate !== undefined && l.estimatedRate !== null
                ? String(l.estimatedRate)
                : null,
            estimatedAmount:
              l.estimatedAmount !== undefined && l.estimatedAmount !== null
                ? String(l.estimatedAmount)
                : null,
            preferredVendorId: l.preferredVendorId ?? null,
            qualitySpec: l.qualitySpec ?? null,
            lineStatus: l.lineStatus ?? "open",
            remarks: l.remarks ?? null,
          };
        }),
      },
    }),
    (data) =>
      db.cnPurchaseIndent.create({
        data,
        include: {
          project: { select: { id: true, name: true, code: true } },
          lines: true,
        },
      }),
  );
  const [{ itemById, uomById, vendorById }, prInfoById] = await Promise.all([
    loadLineLookups(row.lines ?? [], input.orgId),
    loadSourcePrInfo(row.prId ? [row.prId] : []),
  ]);
  return enrichIndent(row, itemById, uomById, prInfoById, vendorById);
}


export async function softDeleteIndent(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnPurchaseIndent.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
