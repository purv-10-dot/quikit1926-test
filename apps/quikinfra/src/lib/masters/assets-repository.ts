/**
 * Assets / Tools master — Prisma-backed CRUD for `cn_assets`.
 */

import { db } from "@/lib/db/prisma";

export interface AssetRecord {
  id: string;
  orgId: string;
  assetCode: string;
  name: string;
  category: string | null;
  projectId: string | null;
  condition: string | null;
  currentLocation: string | null;
  purchaseDate: string | null;
  purchaseValue: string | null;
  currentStock: string | null;
  minStockLevel: string | null;
  reorderLevel: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof (v as any)?.toString === "function") return (v as any).toString();
  return String(v);
}

function toRecord(row: any): AssetRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    assetCode: row.assetCode,
    name: row.name,
    category: row.category ?? null,
    projectId: row.projectId ?? null,
    condition: row.condition ?? null,
    currentLocation: row.currentLocation ?? null,
    purchaseDate: row.purchaseDate ? row.purchaseDate.toISOString() : null,
    purchaseValue:
      row.purchaseValue === null || row.purchaseValue === undefined ? null : toStr(row.purchaseValue),
    currentStock:
      row.currentStock === null || row.currentStock === undefined ? null : toStr(row.currentStock),
    minStockLevel:
      row.minStockLevel === null || row.minStockLevel === undefined ? null : toStr(row.minStockLevel),
    reorderLevel:
      row.reorderLevel === null || row.reorderLevel === undefined ? null : toStr(row.reorderLevel),
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
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
function numOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

export interface ListOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildAssetsWhere(
  opts: Pick<ListOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(q
      ? {
          OR: [
            { assetCode: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
            { currentLocation: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listAssets(opts: ListOptions): Promise<AssetRecord[]> {
  const rows = await (db as any).cnAsset.findMany({
    where: buildAssetsWhere(opts),
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countAssets(
  opts: Pick<ListOptions, "orgId" | "search">,
): Promise<number> {
  return (db as any).cnAsset.count({ where: buildAssetsWhere(opts) });
}

export async function findAssetById(orgId: string, id: string): Promise<AssetRecord | null> {
  const row = await (db as any).cnAsset.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateAssetInput {
  orgId: string;
  createdBy: string;
  assetCode: string;
  name: string;
  category?: string | null;
  projectId?: string | null;
  condition?: string | null;
  currentLocation?: string | null;
  purchaseDate?: string | Date | null;
  purchaseValue?: number | string | null;
  currentStock?: number | string | null;
  minStockLevel?: number | string | null;
  reorderLevel?: number | string | null;
  status?: string;
}

export async function createAsset(input: CreateAssetInput): Promise<AssetRecord> {
  const row = await (db as any).cnAsset.create({
    data: {
      orgId: input.orgId,
      assetCode: String(input.assetCode).trim().toUpperCase(),
      name: String(input.name).trim(),
      category: sOrNull(input.category),
      projectId: sOrNull(input.projectId),
      condition: sOrNull(input.condition),
      currentLocation: sOrNull(input.currentLocation),
      purchaseDate: dateOrNull(input.purchaseDate),
      purchaseValue: numOrNull(input.purchaseValue),
      currentStock: numOrNull(input.currentStock),
      minStockLevel: numOrNull(input.minStockLevel),
      reorderLevel: numOrNull(input.reorderLevel),
      status: input.status ?? "In Use",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateAssetInput
  extends Partial<Omit<CreateAssetInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateAsset(
  orgId: string,
  id: string,
  patch: UpdateAssetInput,
): Promise<AssetRecord | null> {
  const existing = await (db as any).cnAsset.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.assetCode !== undefined) data.assetCode = String(patch.assetCode).trim().toUpperCase();
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.category !== undefined) data.category = sOrNull(patch.category);
  if (patch.projectId !== undefined) data.projectId = sOrNull(patch.projectId);
  if (patch.condition !== undefined) data.condition = sOrNull(patch.condition);
  if (patch.currentLocation !== undefined) data.currentLocation = sOrNull(patch.currentLocation);
  if (patch.purchaseDate !== undefined) data.purchaseDate = dateOrNull(patch.purchaseDate);
  if (patch.purchaseValue !== undefined) data.purchaseValue = numOrNull(patch.purchaseValue);
  if (patch.currentStock !== undefined) data.currentStock = numOrNull(patch.currentStock);
  if (patch.minStockLevel !== undefined) data.minStockLevel = numOrNull(patch.minStockLevel);
  if (patch.reorderLevel !== undefined) data.reorderLevel = numOrNull(patch.reorderLevel);
  if (patch.status !== undefined) data.status = patch.status;

  const row = await (db as any).cnAsset.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteAsset(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnAsset.updateMany({
    where: { id, orgId },
    data: { status: "Disposed", updatedBy },
  });
  return res.count > 0;
}
