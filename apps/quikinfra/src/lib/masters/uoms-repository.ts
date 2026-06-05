/**
 * UOM master — Prisma-backed CRUD for `cn_uoms`.
 */

import { db } from "@/lib/db";

export interface UOMRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  type: string | null;
  precision: number;
  isBase: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: any): UOMRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    name: row.name,
    type: row.type ?? null,
    precision: typeof row.precision === "number" ? row.precision : 0,
    isBase: !!row.isBase,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export interface ListUOMsOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildUOMsWhere(
  opts: Pick<ListUOMsOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { type: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listUOMs(opts: ListUOMsOptions): Promise<UOMRecord[]> {
  const rows = await (db as any).cnUOM.findMany({
    where: buildUOMsWhere(opts),
    orderBy: { code: "asc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countUOMs(
  opts: Pick<ListUOMsOptions, "orgId" | "search">,
): Promise<number> {
  return (db as any).cnUOM.count({ where: buildUOMsWhere(opts) });
}

export async function findUOMById(orgId: string, id: string): Promise<UOMRecord | null> {
  const row = await (db as any).cnUOM.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateUOMInput {
  orgId: string;
  createdBy: string;
  code: string;
  name: string;
  type?: string | null;
  precision?: number | string | null;
  isBase?: boolean;
  status?: string;
}

function toInt(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function createUOM(input: CreateUOMInput): Promise<UOMRecord> {
  const row = await (db as any).cnUOM.create({
    data: {
      orgId: input.orgId,
      code: String(input.code).trim().toUpperCase(),
      name: String(input.name).trim(),
      type: input.type ? String(input.type).trim() : null,
      precision: toInt(input.precision, 0),
      isBase: !!input.isBase,
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateUOMInput
  extends Partial<Omit<CreateUOMInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateUOM(
  orgId: string,
  id: string,
  patch: UpdateUOMInput,
): Promise<UOMRecord | null> {
  const existing = await (db as any).cnUOM.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.code !== undefined) data.code = String(patch.code).trim().toUpperCase();
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.type !== undefined) data.type = patch.type ? String(patch.type).trim() : null;
  if (patch.precision !== undefined) data.precision = toInt(patch.precision, 0);
  if (patch.isBase !== undefined) data.isBase = !!patch.isBase;
  if (patch.status !== undefined) data.status = patch.status;

  const row = await (db as any).cnUOM.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteUOM(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnUOM.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
