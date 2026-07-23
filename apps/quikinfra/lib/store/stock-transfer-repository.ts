/**
 * Stock Transfer repository — Postgres-backed CRUD for
 * `cn_stock_transfers`.
 *
 * Lines live inside the `materials` JSONB column (same pattern we use
 * for Gate Pass / Material Issue / Good Return) so we don't need a
 * parent/child rewrite while the UI still expresses the composition
 * as an array of line rows.
 *
 * Raw SQL throughout — the Prisma client DLL gets locked by the dev
 * server on Windows, so we sidestep `prisma generate`.
 *
 * Response shape is compatible with what the list + detail page used
 * to read from the legacy `globalThis.__qcStockTransfers` array
 * (`transferNumber`, `sourceProjectName`, `fromLocationName`, `lines`,
 * `lineCount`, etc.).
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface StockTransferLine {
  itemId?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  sentQty?: number | string | null;
  quantity?: number | string | null;
  receivedQty?: number | string | null;
  unitRate?: number | string | null;
  amount?: number | string | null;
  remarks?: string | null;
}

export interface StockTransferAssetLine {
  assetId?: string | null;
  assetCode?: string | null;
  assetName?: string | null;
  category?: string | null;
  uomCode?: string | null;
  dispatchCondition?: string | null;
  remarks?: string | null;
}

export interface CreateStockTransferInput {
  orgId: string;
  createdBy: string;
  transferNumber: string;
  transferType?: string | null;
  transferReason?: string | null;
  transferDate: Date;
  sourceProjectId?: string | null;
  sourceProjectName?: string | null;
  destinationProjectId?: string | null;
  destinationProjectName?: string | null;
  fromLocationId?: string | null;
  fromLocationName?: string | null;
  fromState?: string | null;
  fromCity?: string | null;
  toLocationId?: string | null;
  toLocationName?: string | null;
  toState?: string | null;
  toCity?: string | null;
  vehicleNo?: string | null;
  dispatchDateTime?: Date | null;
  estTransitDays?: string | null;
  transactionAmount?: number | string | null;
  interstateTransfer?: boolean;
  chargeableTransfer?: boolean;
  ewayBillNo?: string | null;
  remarks?: string | null;
  initiatedById?: string | null;
  lines?: StockTransferLine[];
  assetLines?: StockTransferAssetLine[];
  status?: string;
}

export interface UpdateStockTransferInput {
  orgId: string;
  updatedBy: string;
  transferType?: string | null;
  transferReason?: string | null;
  transferDate?: Date | null;
  sourceProjectName?: string | null;
  destinationProjectName?: string | null;
  fromLocationName?: string | null;
  fromState?: string | null;
  fromCity?: string | null;
  toLocationName?: string | null;
  toState?: string | null;
  toCity?: string | null;
  vehicleNo?: string | null;
  dispatchDateTime?: Date | null;
  estTransitDays?: string | null;
  transactionAmount?: number | string | null;
  interstateTransfer?: boolean;
  chargeableTransfer?: boolean;
  ewayBillNo?: string | null;
  remarks?: string | null;
  lines?: StockTransferLine[] | null;
  assetLines?: StockTransferAssetLine[] | null;
  status?: string;
}

let didEnsureAssetsCol = false;
async function ensureAssetsColumn() {
  if (didEnsureAssetsCol) return;
  await db.$executeRaw`
    ALTER TABLE app_quikinfra."Stock_transfers"
    ADD COLUMN IF NOT EXISTS assets jsonb NULL;
  `;
  didEnsureAssetsCol = true;
}

function genId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (typeof cryptoObj?.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `st_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** A money/quantity value as it arrives from Prisma (Decimal) or raw SQL. */
type Numericish = Prisma.Decimal | number | string | null | undefined;

/** Raw `SELECT *` row from `Stock_transfers` (+ optional joined display fields). */
interface StockTransferRow {
  id: string;
  orgId: string;
  transferNumber: string;
  transferType?: string | null;
  transferReason?: string | null;
  transferDate?: Date | string | null;
  sourceProjectId?: string | null;
  fromProjectId?: string | null;
  sourceProjectName?: string | null;
  destinationProjectId?: string | null;
  toProjectId?: string | null;
  destinationProjectName?: string | null;
  fromLocationId?: string | null;
  fromLocationName?: string | null;
  fromState?: string | null;
  fromCity?: string | null;
  toLocationId?: string | null;
  toLocationName?: string | null;
  toState?: string | null;
  toCity?: string | null;
  vehicleNo?: string | null;
  dispatchDateTime?: Date | null;
  estTransitDays?: number | null;
  transactionAmount?: Numericish;
  interstateTransfer?: boolean | null;
  chargeableTransfer?: boolean | null;
  ewayBillNo?: string | null;
  remarks?: string | null;
  lineCount?: number | null;
  materials?: unknown;
  assets?: unknown;
  status?: string | null;
  approvalId?: string | null;
  rejectionReason?: string | null;
  returnReason?: string | null;
  submittedAt?: Date | null;
  submittedBy?: string | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  rejectedAt?: Date | null;
  rejectedBy?: string | null;
  returnedAt?: Date | null;
  returnedBy?: string | null;
  dispatchedAt?: Date | null;
  dispatchedBy?: string | null;
  receivedAt?: Date | null;
  receivedBy?: string | null;
  receivedDate?: Date | null;
  initiatedById?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

function toIsoDate(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v?.toISOString) return v.toISOString().slice(0, 10);
  return null;
}

function mapRow(row: StockTransferRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    transferNumber: row.transferNumber,
    transferType: row.transferType ?? null,
    transferReason: row.transferReason ?? null,
    transferDate: toIsoDate(row.transferDate),
    sourceProjectId: row.sourceProjectId ?? row.fromProjectId ?? null,
    sourceProjectName: row.sourceProjectName ?? null,
    destinationProjectId: row.destinationProjectId ?? row.toProjectId ?? null,
    destinationProjectName: row.destinationProjectName ?? null,
    fromLocationId: row.fromLocationId ?? null,
    fromLocationName: row.fromLocationName ?? null,
    fromState: row.fromState ?? null,
    fromCity: row.fromCity ?? null,
    toLocationId: row.toLocationId ?? null,
    toLocationName: row.toLocationName ?? null,
    toState: row.toState ?? null,
    toCity: row.toCity ?? null,
    vehicleNo: row.vehicleNo ?? null,
    dispatchDateTime:
      row.dispatchDateTime?.toISOString?.() ?? row.dispatchDateTime ?? null,
    estTransitDays: row.estTransitDays ?? null,
    transactionAmount:
      row.transactionAmount != null ? Number(row.transactionAmount) : null,
    interstateTransfer: !!row.interstateTransfer,
    chargeableTransfer: !!row.chargeableTransfer,
    ewayBillNo: row.ewayBillNo ?? null,
    remarks: row.remarks ?? null,
    lineCount: row.lineCount ?? 0,
    lines: Array.isArray(row.materials) ? row.materials : [],
    assetLines: Array.isArray(row.assets) ? row.assets : [],
    status: row.status ?? "draft",
    approvalId: row.approvalId ?? null,
    rejectionReason: row.rejectionReason ?? null,
    returnReason: row.returnReason ?? null,
    submittedAt: row.submittedAt?.toISOString?.() ?? row.submittedAt ?? null,
    submittedBy: row.submittedBy ?? null,
    approvedAt: row.approvedAt?.toISOString?.() ?? row.approvedAt ?? null,
    approvedBy: row.approvedBy ?? null,
    rejectedAt: row.rejectedAt?.toISOString?.() ?? row.rejectedAt ?? null,
    rejectedBy: row.rejectedBy ?? null,
    returnedAt: row.returnedAt?.toISOString?.() ?? row.returnedAt ?? null,
    returnedBy: row.returnedBy ?? null,
    dispatchedAt: row.dispatchedAt?.toISOString?.() ?? row.dispatchedAt ?? null,
    dispatchedBy: row.dispatchedBy ?? null,
    receivedAt: row.receivedAt?.toISOString?.() ?? row.receivedAt ?? null,
    receivedBy: row.receivedBy ?? null,
    receivedDate:
      row.receivedDate?.toISOString?.() ?? row.receivedDate ?? null,
    initiatedById: row.initiatedById ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt ?? null,
    createdBy: row.createdBy ?? "",
    updatedBy: row.updatedBy ?? "",
  };
}

function toDecOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface ListStockTransfersOptions {
  status?: string | null;
  projectId?: string | null;
  search?: string | null;
  allowedProjectIds?: string[] | null;
  /** Pagination — push LIMIT/OFFSET down into the raw SQL. */
  take?: number;
  skip?: number;
  /** Server-side sort — whitelisted column key + direction. */
  sortBy?: string | null;
  sortOrder?: "asc" | "desc" | null;
}

// Whitelist of sortable columns → safe SQL fragments.
const ST_SORT_COLUMNS: Record<string, Prisma.Sql> = {
  transferNumber: Prisma.sql`"transferNumber"`,
  transferDate: Prisma.sql`"transferDate"`,
  status: Prisma.sql`status`,
  sourceProjectName: Prisma.sql`"sourceProjectName"`,
  createdAt: Prisma.sql`"createdAt"`,
};

function stockTransfersOrderBy(
  sortBy?: string | null,
  sortOrder?: "asc" | "desc" | null,
): Prisma.Sql {
  const col = sortBy ? ST_SORT_COLUMNS[sortBy] : undefined;
  if (!col) {
    return Prisma.sql`ORDER BY "transferDate" DESC NULLS LAST, "createdAt" DESC`;
  }
  const dir = sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return Prisma.sql`ORDER BY ${col} ${dir} NULLS LAST, "createdAt" DESC`;
}

// Build the WHERE fragment once so list and count stay in sync.
function buildStockTransfersWhere(
  orgId: string,
  opts: Omit<ListStockTransfersOptions, "take" | "skip">,
): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`"orgId" = ${orgId}`];

  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length > 0) {
    // Source-project must be in the allow-list; null sourceProjectId
    // (rare) is also let through to mirror the legacy in-memory filter.
    conds.push(
      Prisma.sql`("sourceProjectId" IS NULL OR "sourceProjectId" = ANY(${allowed}::text[]))`,
    );
  }
  if (opts.status && opts.status !== "all") {
    conds.push(Prisma.sql`LOWER(status) = ${opts.status}`);
  }
  if (opts.projectId) {
    conds.push(Prisma.sql`"sourceProjectId" = ${opts.projectId}`);
  }
  if (opts.search) {
    const q = `%${opts.search.toLowerCase()}%`;
    conds.push(Prisma.sql`(
      LOWER("transferNumber") LIKE ${q}
      OR LOWER(COALESCE("fromLocationName", '')) LIKE ${q}
      OR LOWER(COALESCE("toLocationName", '')) LIKE ${q}
      OR LOWER(COALESCE("sourceProjectName", '')) LIKE ${q}
      OR LOWER(COALESCE("destinationProjectName", '')) LIKE ${q}
      OR LOWER(COALESCE("transferReason", '')) LIKE ${q}
    )`);
  }
  return Prisma.sql` WHERE ${Prisma.join(conds, " AND ")}`;
}

export type StockTransfer = NonNullable<ReturnType<typeof mapRow>>;

export async function listStockTransfers(
  orgId: string,
  opts: ListStockTransfersOptions = {},
): Promise<any[]> {
  await ensureAssetsColumn();
  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length === 0) return [];

  const where = buildStockTransfersWhere(orgId, opts);
  const limitClause = typeof opts.take === "number"
    ? Prisma.sql` LIMIT ${opts.take}`
    : Prisma.empty;
  const offsetClause = typeof opts.skip === "number"
    ? Prisma.sql` OFFSET ${opts.skip}`
    : Prisma.empty;

  // Compose the full statement as a single Prisma.Sql first, then call
  // $queryRaw as a function. The tagged-template form was treating
  // ${where} (itself a Prisma.Sql fragment) as a bound parameter on
  // some 5.x client builds, producing `WHERE $1` and a 42601 syntax
  // error. The function-call form flattens nested fragments cleanly.
  const sql = Prisma.sql`
    SELECT *
    FROM app_quikinfra."Stock_transfers"
    ${where}
    ${stockTransfersOrderBy(opts.sortBy, opts.sortOrder)}
    ${limitClause}${offsetClause}
  `;
  const rows = await db.$queryRaw<StockTransferRow[]>(sql);
  return rows.map(mapRow);
}

export async function countStockTransfers(
  orgId: string,
  opts: Omit<ListStockTransfersOptions, "take" | "skip"> = {},
): Promise<number> {
  await ensureAssetsColumn();
  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length === 0) return 0;
  const where = buildStockTransfersWhere(orgId, opts);
  // Same composition trick as listStockTransfers — see comment there.
  const sql = Prisma.sql`SELECT COUNT(*)::bigint AS c FROM app_quikinfra."Stock_transfers"${where}`;
  const rows: Array<{ c: bigint }> = await db.$queryRaw(sql);
  return Number(rows[0]?.c ?? 0);
}

/** Per-status row counts for the list tab badges (status lower-cased to match
 *  the LOWER(status) filter and lowercase tab keys). */
export async function stockTransferStatusCounts(
  orgId: string,
  opts: Omit<ListStockTransfersOptions, "take" | "skip" | "status" | "sortBy" | "sortOrder"> = {},
): Promise<Record<string, number>> {
  await ensureAssetsColumn();
  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length === 0) return {};
  const where = buildStockTransfersWhere(orgId, { ...opts, status: null });
  const sql = Prisma.sql`
    SELECT LOWER(status) AS status, COUNT(*)::int AS count
    FROM app_quikinfra."Stock_transfers"${where}
    GROUP BY LOWER(status)
  `;
  const rows = await db.$queryRaw<Array<{ status: string | null; count: number }>>(sql);
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.status ?? "")] = Number(r.count) || 0;
  return out;
}

export async function findStockTransferById(
  orgId: string,
  id: string,
): Promise<StockTransfer | null> {
  await ensureAssetsColumn();
  const rows = await db.$queryRaw<StockTransferRow[]>`
    SELECT *
    FROM app_quikinfra."Stock_transfers"
    WHERE "orgId" = ${orgId} AND id = ${id}
    LIMIT 1
  `;
  return rows.length ? mapRow(rows[0]) : null;
}

export async function createStockTransfer(
  input: CreateStockTransferInput,
): Promise<StockTransfer | null> {
  await ensureAssetsColumn();
  const id = genId();
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const materialsJson = JSON.stringify(lines);
  const assetLines = Array.isArray(input.assetLines) ? input.assetLines : [];
  const assetsJson = JSON.stringify(assetLines);
  const lineCount = lines.length;
  const now = new Date();

  await db.$executeRaw`
    INSERT INTO app_quikinfra."Stock_transfers" (
      id, "orgId", "transferNumber",
      "transferType", "transferReason", "transferDate",
      "fromProjectId", "sourceProjectId", "sourceProjectName",
      "toProjectId", "destinationProjectId", "destinationProjectName",
      "fromLocationId", "fromLocationName", "fromState", "fromCity",
      "toLocationId", "toLocationName", "toState", "toCity",
      "vehicleNo", "dispatchDateTime", "estTransitDays",
      "transactionAmount", "interstateTransfer", "chargeableTransfer",
      "ewayBillNo", remarks,
      "initiatedById", "lineCount", materials, assets, status,
      "createdAt", "updatedAt", "createdBy", "updatedBy"
    ) VALUES (
      ${id}, ${input.orgId}, ${input.transferNumber},
      ${input.transferType ?? null}, ${input.transferReason ?? null},
      ${input.transferDate},
      ${input.sourceProjectId ?? null}, ${input.sourceProjectId ?? null}, ${input.sourceProjectName ?? null},
      ${input.destinationProjectId ?? null}, ${input.destinationProjectId ?? null}, ${input.destinationProjectName ?? null},
      ${input.fromLocationId ?? null}, ${input.fromLocationName ?? null},
      ${input.fromState ?? null}, ${input.fromCity ?? null},
      ${input.toLocationId ?? null}, ${input.toLocationName ?? null},
      ${input.toState ?? null}, ${input.toCity ?? null},
      ${input.vehicleNo ?? null}, ${input.dispatchDateTime ?? null},
      ${input.estTransitDays ?? null},
      ${toDecOrNull(input.transactionAmount)}::numeric,
      ${!!input.interstateTransfer}, ${!!input.chargeableTransfer},
      ${input.ewayBillNo ?? null}, ${input.remarks ?? null},
      ${input.initiatedById ?? input.createdBy},
      ${lineCount}, ${materialsJson}::jsonb, ${assetsJson}::jsonb, ${input.status ?? "draft"},
      ${now}, ${now}, ${input.createdBy}, ${input.createdBy}
    )
  `;

  return (await findStockTransferById(input.orgId, id))!;
}

export async function updateStockTransfer(
  id: string,
  input: UpdateStockTransferInput,
): Promise<StockTransfer | null> {
  await ensureAssetsColumn();
  const existing = await findStockTransferById(input.orgId, id);
  if (!existing) return null;
  const linesChanged = Array.isArray(input.lines);
  const lines = linesChanged ? input.lines ?? [] : existing.lines;
  const lineCount = linesChanged ? lines.length : existing.lineCount ?? 0;
  const assetsChanged = Array.isArray(input.assetLines);
  const assetLines = assetsChanged ? input.assetLines ?? [] : existing.assetLines ?? [];

  const next = {
    transferType: input.transferType ?? existing.transferType,
    transferReason: input.transferReason ?? existing.transferReason,
    transferDate: input.transferDate ?? null,
    sourceProjectName:
      input.sourceProjectName ?? existing.sourceProjectName,
    destinationProjectName:
      input.destinationProjectName ?? existing.destinationProjectName,
    fromLocationName: input.fromLocationName ?? existing.fromLocationName,
    fromState: input.fromState ?? existing.fromState,
    fromCity: input.fromCity ?? existing.fromCity,
    toLocationName: input.toLocationName ?? existing.toLocationName,
    toState: input.toState ?? existing.toState,
    toCity: input.toCity ?? existing.toCity,
    vehicleNo: input.vehicleNo ?? existing.vehicleNo,
    dispatchDateTime: input.dispatchDateTime ?? null,
    estTransitDays: input.estTransitDays ?? existing.estTransitDays,
    transactionAmount:
      input.transactionAmount !== undefined
        ? input.transactionAmount
        : existing.transactionAmount,
    interstateTransfer:
      input.interstateTransfer !== undefined
        ? input.interstateTransfer
        : existing.interstateTransfer,
    chargeableTransfer:
      input.chargeableTransfer !== undefined
        ? input.chargeableTransfer
        : existing.chargeableTransfer,
    ewayBillNo: input.ewayBillNo ?? existing.ewayBillNo,
    remarks: input.remarks ?? existing.remarks,
    status: input.status ?? existing.status,
  };

  await db.$executeRaw`
    UPDATE app_quikinfra."Stock_transfers"
    SET
      "transferType"           = ${next.transferType},
      "transferReason"         = ${next.transferReason},
      "transferDate"           = COALESCE(${next.transferDate}, "transferDate"),
      "sourceProjectName"      = ${next.sourceProjectName},
      "destinationProjectName" = ${next.destinationProjectName},
      "fromLocationName"       = ${next.fromLocationName},
      "fromState"              = ${next.fromState},
      "fromCity"               = ${next.fromCity},
      "toLocationName"         = ${next.toLocationName},
      "toState"                = ${next.toState},
      "toCity"                 = ${next.toCity},
      "vehicleNo"              = ${next.vehicleNo},
      "dispatchDateTime"       = COALESCE(${next.dispatchDateTime}, "dispatchDateTime"),
      "estTransitDays"         = ${next.estTransitDays},
      "transactionAmount"      = ${toDecOrNull(next.transactionAmount)}::numeric,
      "interstateTransfer"     = ${!!next.interstateTransfer},
      "chargeableTransfer"     = ${!!next.chargeableTransfer},
      "ewayBillNo"             = ${next.ewayBillNo},
      remarks                  = ${next.remarks},
      status                   = ${next.status},
      "lineCount"              = ${lineCount},
      materials                = ${JSON.stringify(lines)}::jsonb,
      assets                   = ${JSON.stringify(assetLines)}::jsonb,
      "updatedAt"              = ${new Date()},
      "updatedBy"              = ${input.updatedBy}
    WHERE "orgId" = ${input.orgId} AND id = ${id}
  `;

  return findStockTransferById(input.orgId, id);
}

export async function patchStockTransferStatus(
  orgId: string,
  id: string,
  patch: {
    status?: string;
    approvalId?: string | null;
    rejectionReason?: string | null;
    returnReason?: string | null;
    submittedAt?: Date | null;
    submittedBy?: string | null;
    approvedAt?: Date | null;
    approvedBy?: string | null;
    rejectedAt?: Date | null;
    rejectedBy?: string | null;
    returnedAt?: Date | null;
    returnedBy?: string | null;
    dispatchedAt?: Date | null;
    dispatchedBy?: string | null;
    receivedAt?: Date | null;
    receivedBy?: string | null;
    receivedDate?: Date | null;
    updatedBy: string;
  },
): Promise<StockTransfer | null> {
  await ensureAssetsColumn();
  const existing = await findStockTransferById(orgId, id);
  if (!existing) return null;

  const pick = <T>(v: T | undefined, fallback: T): T =>
    v !== undefined ? v : fallback;
  const dateOrNull = (v: string | Date | null): Date | null =>
    v ? new Date(v) : null;

  const next = {
    status: pick(patch.status, existing.status),
    approvalId: pick(patch.approvalId, existing.approvalId),
    rejectionReason: pick(patch.rejectionReason, existing.rejectionReason),
    returnReason: pick(patch.returnReason, existing.returnReason),
    submittedAt: pick(patch.submittedAt, dateOrNull(existing.submittedAt)),
    submittedBy: pick(patch.submittedBy, existing.submittedBy),
    approvedAt: pick(patch.approvedAt, dateOrNull(existing.approvedAt)),
    approvedBy: pick(patch.approvedBy, existing.approvedBy),
    rejectedAt: pick(patch.rejectedAt, dateOrNull(existing.rejectedAt)),
    rejectedBy: pick(patch.rejectedBy, existing.rejectedBy),
    returnedAt: pick(patch.returnedAt, dateOrNull(existing.returnedAt)),
    returnedBy: pick(patch.returnedBy, existing.returnedBy),
    dispatchedAt: pick(patch.dispatchedAt, dateOrNull(existing.dispatchedAt)),
    dispatchedBy: pick(patch.dispatchedBy, existing.dispatchedBy),
    receivedAt: pick(patch.receivedAt, dateOrNull(existing.receivedAt)),
    receivedBy: pick(patch.receivedBy, existing.receivedBy),
    receivedDate:
      pick(patch.receivedDate, dateOrNull(existing.receivedDate)),
  };

  await db.$executeRaw`
    UPDATE app_quikinfra."Stock_transfers"
    SET
      status             = ${next.status},
      "approvalId"       = ${next.approvalId},
      "rejectionReason"  = ${next.rejectionReason},
      "returnReason"     = ${next.returnReason},
      "submittedAt"      = ${next.submittedAt},
      "submittedBy"      = ${next.submittedBy},
      "approvedAt"       = ${next.approvedAt},
      "approvedBy"       = ${next.approvedBy},
      "rejectedAt"       = ${next.rejectedAt},
      "rejectedBy"       = ${next.rejectedBy},
      "returnedAt"       = ${next.returnedAt},
      "returnedBy"       = ${next.returnedBy},
      "dispatchedAt"     = ${next.dispatchedAt},
      "dispatchedBy"     = ${next.dispatchedBy},
      "receivedAt"       = ${next.receivedAt},
      "receivedBy"       = ${next.receivedBy},
      "receivedDate"     = ${next.receivedDate},
      "updatedAt"        = ${new Date()},
      "updatedBy"        = ${patch.updatedBy}
    WHERE "orgId" = ${orgId} AND id = ${id}
  `;
  return findStockTransferById(orgId, id);
}

export async function deleteStockTransfer(
  orgId: string,
  id: string,
): Promise<boolean> {
  const res = await db.$executeRaw`
    DELETE FROM app_quikinfra."Stock_transfers"
    WHERE "orgId" = ${orgId} AND id = ${id}
  `;
  return Number(res) > 0;
}

/** Next per-day sequence for the ST-<YYYYMMDD>-<NNNN> number. */
export async function countStockTransfersForDate(
  orgId: string,
  dateYYYYMMDD: string,
): Promise<number> {
  const rows = await db.$queryRaw<{ c: number }[]>`
    SELECT COUNT(*)::int AS c
    FROM app_quikinfra."Stock_transfers"
    WHERE "orgId" = ${orgId}
      AND to_char("transferDate", 'YYYY-MM-DD') = ${dateYYYYMMDD}
  `;
  return Number(rows[0]?.c ?? 0);
}
