/**
 * GST Codes master — Prisma-backed CRUD for `cn_gst_codes`.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface GSTCodeRecord {
  id: string;
  orgId: string;
  code: string;
  codeType: string | null;
  description: string;
  rate: string;
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  isRcm: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  itemGroupId: string | null;
  itemGroupName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toRecord(row: Prisma.CnGSTCodeGetPayload<Record<string, never>>): GSTCodeRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    codeType: row.codeType ?? null,
    description: row.description ?? "",
    rate: toStr(row.rate),
    cgstRate: toStr(row.cgstRate),
    sgstRate: toStr(row.sgstRate),
    igstRate: toStr(row.igstRate),
    isRcm: !!row.isRcm,
    // Date-only fields — return "YYYY-MM-DD" so the edit form's <input type="date">
    // can load them (a full ISO datetime string renders blank in a date input).
    effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString().slice(0, 10) : null,
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    itemGroupId: row.itemGroupId ?? null,
    itemGroupName: row.itemGroupName ?? null,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListGSTOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildGSTCodesWhere(
  opts: Pick<ListGSTOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    // "deleted" rows are removed from the UI entirely; "inactive" rows are
    // still returned so they can show under the Inactive tab.
    status: { not: "deleted" },
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { codeType: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listGSTCodes(opts: ListGSTOptions): Promise<GSTCodeRecord[]> {
  const rows = await db.cnGSTCode.findMany({
    where: buildGSTCodesWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countGSTCodes(
  opts: Pick<ListGSTOptions, "orgId" | "search">,
): Promise<number> {
  return db.cnGSTCode.count({ where: buildGSTCodesWhere(opts) });
}

export async function findGSTCodeById(
  orgId: string,
  id: string,
): Promise<GSTCodeRecord | null> {
  const row = await db.cnGSTCode.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateGSTInput {
  orgId: string;
  createdBy: string;
  code: string;
  codeType?: string | null;
  description: string;
  igstRate: number | string;
  isRcm?: boolean;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  itemGroupId?: string | null;
  itemGroupName?: string | null;
  status?: string;
}

function sOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function dateOrNull(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
function numOrZero(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function createGSTCode(input: CreateGSTInput): Promise<GSTCodeRecord> {
  const igst = numOrZero(input.igstRate);
  if (igst < 0) throw new Error("IGST rate must be non-negative");

  const row = await db.cnGSTCode.create({
    data: {
      orgId: input.orgId,
      code: String(input.code).trim(),
      codeType: sOrNull(input.codeType),
      description: String(input.description).trim(),
      rate: String(igst),
      cgstRate: String(igst / 2),
      sgstRate: String(igst / 2),
      igstRate: String(igst),
      isRcm: !!input.isRcm,
      effectiveFrom: dateOrNull(input.effectiveFrom),
      effectiveTo: dateOrNull(input.effectiveTo),
      itemGroupId: sOrNull(input.itemGroupId),
      itemGroupName: sOrNull(input.itemGroupName),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateGSTInput
  extends Partial<Omit<CreateGSTInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateGSTCode(
  orgId: string,
  id: string,
  patch: UpdateGSTInput,
): Promise<GSTCodeRecord | null> {
  const existing = await db.cnGSTCode.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.code !== undefined) data.code = String(patch.code).trim();
  if (patch.codeType !== undefined) data.codeType = sOrNull(patch.codeType);
  if (patch.description !== undefined) data.description = String(patch.description).trim();
  if (patch.igstRate !== undefined) {
    const igst = numOrZero(patch.igstRate);
    data.rate = String(igst);
    data.cgstRate = String(igst / 2);
    data.sgstRate = String(igst / 2);
    data.igstRate = String(igst);
  }
  if (patch.isRcm !== undefined) data.isRcm = !!patch.isRcm;
  if (patch.effectiveFrom !== undefined) data.effectiveFrom = dateOrNull(patch.effectiveFrom);
  if (patch.effectiveTo !== undefined) data.effectiveTo = dateOrNull(patch.effectiveTo);
  if (patch.itemGroupId !== undefined) data.itemGroupId = sOrNull(patch.itemGroupId);
  if (patch.itemGroupName !== undefined) data.itemGroupName = sOrNull(patch.itemGroupName);
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnGSTCode.update({ where: { id }, data });
  return toRecord(row);
}

/**
 * Status of an existing GST code with this (orgId, code) — including
 * soft-deleted rows. Used to give a clear message when a create hits the
 * (orgId, code) unique constraint: a "deleted" row still reserves the code.
 */
export async function findGSTCodeStatusByCode(
  orgId: string,
  code: string,
): Promise<string | null> {
  const row = await db.cnGSTCode.findFirst({
    where: { orgId, code: String(code).trim() },
    select: { status: true },
  });
  return row?.status ?? null;
}

export async function deleteGSTCode(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnGSTCode.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}
