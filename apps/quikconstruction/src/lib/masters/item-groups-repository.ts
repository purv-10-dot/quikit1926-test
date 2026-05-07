/**
 * Item Groups master — Prisma-backed CRUD for `item_groups`.
 * Hierarchical; depth derived from parent on write.
 */

import { db } from "@/lib/db/prisma";

export interface ItemGroupRecord {
  id: string;
  tenantId: string;
  orgId: string;
  name: string;
  parentId: string | null;
  depth: number;
  sortOrder: number;
  workCategoryId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: any): ItemGroupRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orgId: row.orgId,
    name: row.name,
    parentId: row.parentId ?? null,
    depth: row.depth ?? 0,
    sortOrder: row.sortOrder ?? 0,
    workCategoryId: row.workCategoryId ?? null,
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
function toIntOrZero(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : 0;
}

async function resolveDepth(tenantId: string, parentId: string | null): Promise<number> {
  if (!parentId) return 0;
  const parent = await (db as any).cnItemGroup.findFirst({
    where: { id: parentId, tenantId },
    select: { depth: true },
  });
  return parent ? (parent.depth ?? 0) + 1 : 0;
}

export interface ListOptions {
  tenantId: string;
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildItemGroupsWhere(
  opts: Pick<ListOptions, "tenantId" | "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    tenantId: opts.tenantId,
    orgId: opts.orgId,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
}

export async function listItemGroups(opts: ListOptions): Promise<ItemGroupRecord[]> {
  const rows = await (db as any).cnItemGroup.findMany({
    where: buildItemGroupsWhere(opts),
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countItemGroups(
  opts: Pick<ListOptions, "tenantId" | "orgId" | "search">,
): Promise<number> {
  return (db as any).cnItemGroup.count({ where: buildItemGroupsWhere(opts) });
}

export async function findItemGroupById(tenantId: string, id: string): Promise<ItemGroupRecord | null> {
  const row = await (db as any).cnItemGroup.findFirst({ where: { id, tenantId } });
  return row ? toRecord(row) : null;
}

export interface CreateItemGroupInput {
  tenantId: string;
  orgId: string;
  createdBy: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number | string | null;
  workCategoryId?: string | null;
  status?: string;
}

export async function createItemGroup(input: CreateItemGroupInput): Promise<ItemGroupRecord> {
  const parentId = sOrNull(input.parentId);
  const depth = await resolveDepth(input.tenantId, parentId);
  const row = await (db as any).cnItemGroup.create({
    data: {
      tenantId: input.tenantId,
      orgId: input.orgId,
      name: String(input.name).trim(),
      parentId,
      depth,
      sortOrder: toIntOrZero(input.sortOrder),
      workCategoryId: sOrNull(input.workCategoryId),
      status: input.status ?? "active",
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    },
  });
  return toRecord(row);
}

export interface UpdateItemGroupInput
  extends Partial<Omit<CreateItemGroupInput, "tenantId" | "orgId" | "createdBy">> {
  updatedBy: string;
  tenantId?: string;
}

export async function updateItemGroup(
  tenantId: string,
  id: string,
  patch: UpdateItemGroupInput,
): Promise<ItemGroupRecord | null> {
  const existing = await (db as any).cnItemGroup.findFirst({
    where: { id, tenantId },
    select: { id: true, parentId: true },
  });
  if (!existing) return null;

  const data: Record<string, unknown> = { updatedBy: patch.updatedBy };
  if (patch.name !== undefined) data.name = String(patch.name).trim();
  if (patch.sortOrder !== undefined) data.sortOrder = toIntOrZero(patch.sortOrder);
  if (patch.workCategoryId !== undefined) data.workCategoryId = sOrNull(patch.workCategoryId);
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.parentId !== undefined) {
    const newParentId = sOrNull(patch.parentId);
    if (newParentId === id) throw new Error("Group cannot be its own parent");
    data.parentId = newParentId;
    data.depth = await resolveDepth(tenantId, newParentId);
  }

  const row = await (db as any).cnItemGroup.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteItemGroup(
  tenantId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnItemGroup.updateMany({
    where: { id, tenantId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
