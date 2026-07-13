/**
 * TDS Codes master — Prisma-backed CRUD for `cn_tds_codes`.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface TDSCodeRecord {
  id: string;
  orgId: string;
  section: string;
  description: string;
  rate: string;
  thresholdAmount: string | null;
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

function toRecord(row: Prisma.CnTDSCodeGetPayload<Record<string, never>>): TDSCodeRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    section: row.section,
    description: row.description ?? "",
    rate: toStr(row.rate),
    thresholdAmount:
      row.thresholdAmount === null || row.thresholdAmount === undefined
        ? null
        : toStr(row.thresholdAmount),
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListTDSOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildTDSCodesWhere(
  opts: Pick<ListTDSOptions, "orgId" | "search">,
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
            { section: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listTDSCodes(opts: ListTDSOptions): Promise<TDSCodeRecord[]> {
  const rows = await db.cnTDSCode.findMany({
    where: buildTDSCodesWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countTDSCodes(
  opts: Pick<ListTDSOptions, "orgId" | "search">,
): Promise<number> {
  return db.cnTDSCode.count({ where: buildTDSCodesWhere(opts) });
}

export async function findTDSCodeById(
  orgId: string,
  id: string,
): Promise<TDSCodeRecord | null> {
  const row = await db.cnTDSCode.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateTDSInput {
  orgId: string;
  createdBy: string;
  section: string;
  description: string;
  rate: number | string;
  thresholdAmount?: number | string | null;
  status?: string;
}

function numOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

export async function createTDSCode(input: CreateTDSInput): Promise<TDSCodeRecord> {
  const rate = numOrNull(input.rate);
  if (rate === null) throw new Error("Rate must be a number");

  const row = await db.cnTDSCode.create({
    data: {
      orgId: input.orgId,
      section: String(input.section).trim(),
      description: String(input.description).trim(),
      rate,
      thresholdAmount: numOrNull(input.thresholdAmount),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateTDSInput
  extends Partial<Omit<CreateTDSInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateTDSCode(
  orgId: string,
  id: string,
  patch: UpdateTDSInput,
): Promise<TDSCodeRecord | null> {
  const existing = await db.cnTDSCode.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.section !== undefined) data.section = String(patch.section).trim();
  if (patch.description !== undefined) data.description = String(patch.description).trim();
  if (patch.rate !== undefined) {
    const r = numOrNull(patch.rate);
    if (r === null) throw new Error("Rate must be a number");
    data.rate = r;
  }
  if (patch.thresholdAmount !== undefined) data.thresholdAmount = numOrNull(patch.thresholdAmount);
  if (patch.status !== undefined) data.status = patch.status;

  const row = await db.cnTDSCode.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteTDSCode(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnTDSCode.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}
