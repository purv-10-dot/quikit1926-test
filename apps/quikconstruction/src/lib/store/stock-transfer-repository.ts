/**
 * Stock Transfer repository — Postgres-backed CRUD for
 * `stock_transfers`.
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

import { db } from "@/lib/db/prisma";
import { Prisma } from "../../../node_modules/.prisma-qc/client";

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

export interface CreateStockTransferInput {
  tenantId: string;
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
  status?: string;
}

export interface UpdateStockTransferInput {
  tenantId: string;
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
  status?: string;
}

function genId(): string {
  if (typeof (globalThis as any).crypto?.randomUUID === "function") {
    return (globalThis as any).crypto.randomUUID();
  }
  return `st_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toIsoDate(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v?.toISOString) return v.toISOString().slice(0, 10);
  return null;
}

function mapRow(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
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
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

function toDecOrNull(v: any): number | null {
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
}

// Build the WHERE fragment once so list and count stay in sync.
function buildStockTransfersWhere(
  tenantId: string,
  opts: Omit<ListStockTransfersOptions, "take" | "skip">,
): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`"tenantId" = ${tenantId}`];

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

export async function listStockTransfers(
  tenantId: string,
  opts: ListStockTransfersOptions = {},
): Promise<any[]> {
  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length === 0) return [];

  const where = buildStockTransfersWhere(tenantId, opts);
  const limitClause = typeof opts.take === "number"
    ? Prisma.sql` LIMIT ${opts.take}`
    : Prisma.empty;
  const offsetClause = typeof opts.skip === "number"
    ? Prisma.sql` OFFSET ${opts.skip}`
    : Prisma.empty;

  const rows: any[] = await (db as any).$queryRaw`
    SELECT *
    FROM app_quikconstruction."Stock_transfers"
    ${where}
    ORDER BY "transferDate" DESC NULLS LAST, "createdAt" DESC
    ${limitClause}${offsetClause}
  `;
  return rows.map(mapRow);
}

export async function countStockTransfers(
  tenantId: string,
  opts: Omit<ListStockTransfersOptions, "take" | "skip"> = {},
): Promise<number> {
  const allowed = opts.allowedProjectIds ?? null;
  if (allowed !== null && allowed.length === 0) return 0;
  const where = buildStockTransfersWhere(tenantId, opts);
  const rows: Array<{ c: bigint }> = await (db as any).$queryRaw`
    SELECT COUNT(*)::bigint AS c FROM app_quikconstruction."Stock_transfers"${where}
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function findStockTransferById(
  tenantId: string,
  id: string,
): Promise<any | null> {
  const rows: any[] = await (db as any).$queryRaw`
    SELECT *
    FROM app_quikconstruction."Stock_transfers"
    WHERE "tenantId" = ${tenantId} AND id = ${id}
    LIMIT 1
  `;
  return rows.length ? mapRow(rows[0]) : null;
}

export async function createStockTransfer(
  input: CreateStockTransferInput,
): Promise<any> {
  const id = genId();
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const materialsJson = JSON.stringify(lines);
  const lineCount = lines.length;
  const now = new Date();

  await (db as any).$executeRaw`
    INSERT INTO app_quikconstruction."Stock_transfers" (
      id, "tenantId", "orgId", "transferNumber",
      "transferType", "transferReason", "transferDate",
      "fromProjectId", "sourceProjectId", "sourceProjectName",
      "toProjectId", "destinationProjectId", "destinationProjectName",
      "fromLocationId", "fromLocationName", "fromState", "fromCity",
      "toLocationId", "toLocationName", "toState", "toCity",
      "vehicleNo", "dispatchDateTime", "estTransitDays",
      "transactionAmount", "interstateTransfer", "chargeableTransfer",
      "ewayBillNo", remarks,
      "initiatedById", "lineCount", materials, status,
      "createdAt", "updatedAt", "createdBy", "updatedBy"
    ) VALUES (
      ${id}, ${input.tenantId}, ${input.orgId}, ${input.transferNumber},
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
      ${lineCount}, ${materialsJson}::jsonb, ${input.status ?? "draft"},
      ${now}, ${now}, ${input.createdBy}, ${input.createdBy}
    )
  `;

  return (await findStockTransferById(input.tenantId, id))!;
}

export async function updateStockTransfer(
  id: string,
  input: UpdateStockTransferInput,
): Promise<any | null> {
  const existing = await findStockTransferById(input.tenantId, id);
  if (!existing) return null;
  const linesChanged = Array.isArray(input.lines);
  const lines = linesChanged ? input.lines ?? [] : existing.lines;
  const lineCount = linesChanged ? lines.length : existing.lineCount ?? 0;

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

  await (db as any).$executeRaw`
    UPDATE app_quikconstruction."Stock_transfers"
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
      "updatedAt"              = ${new Date()},
      "updatedBy"              = ${input.updatedBy}
    WHERE "tenantId" = ${input.tenantId} AND id = ${id}
  `;

  return findStockTransferById(input.tenantId, id);
}

export async function patchStockTransferStatus(
  tenantId: string,
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
): Promise<any | null> {
  const existing = await findStockTransferById(tenantId, id);
  if (!existing) return null;

  const pick = <T>(v: T | undefined, fallback: T): T =>
    v !== undefined ? v : fallback;
  const dateOrNull = (v: string | null): Date | null =>
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

  await (db as any).$executeRaw`
    UPDATE app_quikconstruction."Stock_transfers"
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
    WHERE "tenantId" = ${tenantId} AND id = ${id}
  `;
  return findStockTransferById(tenantId, id);
}

export async function deleteStockTransfer(
  tenantId: string,
  id: string,
): Promise<boolean> {
  const res: any = await (db as any).$executeRaw`
    DELETE FROM app_quikconstruction."Stock_transfers"
    WHERE "tenantId" = ${tenantId} AND id = ${id}
  `;
  return Number(res) > 0;
}

/** Next per-day sequence for the ST-<YYYYMMDD>-<NNNN> number. */
export async function countStockTransfersForDate(
  tenantId: string,
  dateYYYYMMDD: string,
): Promise<number> {
  const rows: any[] = await (db as any).$queryRaw`
    SELECT COUNT(*)::int AS c
    FROM app_quikconstruction."Stock_transfers"
    WHERE "tenantId" = ${tenantId}
      AND to_char("transferDate", 'YYYY-MM-DD') = ${dateYYYYMMDD}
  `;
  return Number(rows[0]?.c ?? 0);
}
