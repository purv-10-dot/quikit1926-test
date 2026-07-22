/**
 * Item Groups master — Prisma-backed CRUD for `cn_item_groups`.
 * Hierarchical; depth derived from parent on write.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";

export interface ItemGroupRecord {
  id: string;
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

function toRecord(row: Prisma.CnItemGroupGetPayload<Record<string, never>>): ItemGroupRecord {
  return {
    id: row.id,
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

async function resolveDepth(orgId: string, parentId: string | null): Promise<number> {
  if (!parentId) return 0;
  const parent = await db.cnItemGroup.findFirst({
    where: { id: parentId, orgId },
    select: { depth: true },
  });
  return parent ? (parent.depth ?? 0) + 1 : 0;
}

export interface ListOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildItemGroupsWhere(
  opts: Pick<ListOptions, "orgId" | "search">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    // "deleted" rows are removed from the UI entirely; "inactive" rows are
    // still returned so they can show under the Inactive tab.
    status: { not: "deleted" },
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
}

export async function listItemGroups(opts: ListOptions): Promise<ItemGroupRecord[]> {
  const rows = await db.cnItemGroup.findMany({
    where: buildItemGroupsWhere(opts),
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countItemGroups(
  opts: Pick<ListOptions, "orgId" | "search">,
): Promise<number> {
  return db.cnItemGroup.count({ where: buildItemGroupsWhere(opts) });
}

export async function findItemGroupById(orgId: string, id: string): Promise<ItemGroupRecord | null> {
  const row = await db.cnItemGroup.findFirst({ where: { id, orgId } });
  return row ? toRecord(row) : null;
}

export interface CreateItemGroupInput {
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
  const depth = await resolveDepth(input.orgId, parentId);
  const row = await db.cnItemGroup.create({
    data: {
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
  extends Partial<Omit<CreateItemGroupInput, "orgId" | "createdBy">> {
  updatedBy: string;
}

export async function updateItemGroup(
  orgId: string,
  id: string,
  patch: UpdateItemGroupInput,
): Promise<ItemGroupRecord | null> {
  const existing = await db.cnItemGroup.findFirst({
    where: { id, orgId },
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
    data.depth = await resolveDepth(orgId, newParentId);
  }

  const row = await db.cnItemGroup.update({ where: { id }, data });
  return toRecord(row);
}

export async function deleteItemGroup(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await db.cnItemGroup.updateMany({
    where: { id, orgId },
    data: { status: "deleted", updatedBy },
  });
  return res.count > 0;
}
