/**
 * Items master — Prisma-backed CRUD for `cn_items`.
 */

import { db } from "@/lib/db/prisma";

export interface ItemRecord {
  id: string;
  orgId: string;
  code: string;
  name: string;
  description: string | null;
  itemType: string | null;
  groupId: string;
  groupName: string;
  uomId: string;
  uomCode: string;
  uomCodes: string[];
  hsnCode: string | null;
  gstRate: string | null;
  standardRate: string | null;
  minStockLevel: string | null;
  reorderLevel: string | null;
  currentStock: string;
  status: string;
  /** Back-compat alias — the Indent/PR forms read `groupName` via this. */
  category: string;
  /** Multi-UOM support — the array of UOM IDs picked for this item. */
  uomIds: string[];
  /** Back-compat alias of description — older writers called it this. */
  specifications: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

function toRecord(row: any, uomLookup?: Map<string, string>): ItemRecord {
  const groupName: string = row.group?.name ?? "";
  const uomCode: string = row.uom?.code ?? "";
  const description: string | null = row.description ?? null;

  const rawIds: string[] =
    Array.isArray(row.uomIds) && row.uomIds.length ? row.uomIds : [row.uomId];
  const uniqueIds = Array.from(new Set(rawIds.filter(Boolean)));
  const uomCodes = uniqueIds.map((id) => uomLookup?.get(id) ?? (id === row.uomId ? uomCode : ""))
    .filter(Boolean);

  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    name: row.name,
    description,
    itemType: row.itemType ?? null,
    groupId: row.groupId,
    groupName,
    uomId: row.uomId,
    uomCode,
    uomCodes,
    hsnCode: row.hsnCode ?? null,
    gstRate: row.gstRate?.toString?.() ?? null,
    standardRate: row.standardRate?.toString?.() ?? null,
    minStockLevel: row.minStockLevel?.toString?.() ?? null,
    reorderLevel: row.reorderLevel?.toString?.() ?? null,
    currentStock: "0",
    status: row.status,
    category: row.category ?? groupName,
    uomIds: uniqueIds,
    specifications: description,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

async function buildUomLookup(
  orgId: string,
  ids: Iterable<string>,
): Promise<Map<string, string>> {
  const wanted = Array.from(new Set(Array.from(ids).filter(Boolean)));
  if (wanted.length === 0) return new Map();
  const rows = await (db as any).cnUOM.findMany({
    where: { orgId, id: { in: wanted } },
    select: { id: true, code: true },
  });
  return new Map(rows.map((r: any) => [r.id, r.code as string]));
}

// ─── Auto-code helpers ─────────────────────────────────────────────

function makeItemInitials(name: string): string {
  const initials = String(name ?? "")
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return initials || "ITM";
}

async function nextItemCodeSeq(tx: any, orgId: string): Promise<number> {
  const rows = await tx.cnItem.findMany({
    where: { orgId },
    select: { code: true },
  });
  let max = 0;
  for (const r of rows as Array<{ code: string | null }>) {
    const m = /-(\d+)$/.exec(r.code ?? "");
    if (!m) continue;
    const n = parseInt(m[1]!, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

// ─── FK find-or-create helpers ─────────────────────────────────────

async function ensureItemGroup(
  tx: any,
  orgId: string,
  name: string,
  createdBy: string,
): Promise<string> {
  const clean = String(name ?? "").trim();
  if (!clean) throw new Error("Category (item group) is required");
  const existing = await tx.cnItemGroup.findFirst({
    where: { orgId, name: clean },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.cnItemGroup.create({
    data: {
      orgId,
      name: clean,
      createdBy,
      updatedBy: createdBy,
    },
    select: { id: true },
  });
  return created.id;
}

async function ensureDefaultItemGroup(
  tx: any,
  orgId: string,
  createdBy: string,
): Promise<string> {
  const DEFAULT_GROUP_NAME = "Others";
  return ensureItemGroup(tx, orgId, DEFAULT_GROUP_NAME, createdBy);
}

async function ensureUOM(
  tx: any,
  orgId: string,
  code: string,
  createdBy: string,
): Promise<string> {
  const clean = String(code ?? "").trim().toUpperCase();
  if (!clean) throw new Error("UOM code is required");
  const existing = await tx.cnUOM.findFirst({
    where: { orgId, code: clean },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.cnUOM.create({
    data: {
      orgId,
      code: clean,
      name: clean,
      createdBy,
      updatedBy: createdBy,
    },
    select: { id: true },
  });
  return created.id;
}

// ─── Public API ────────────────────────────────────────────────────

export interface ListItemsOptions {
  orgId: string;
  createdBy: string;
  search?: string;
  groupId?: string;
  includeInactive?: boolean;
  /** Pagination — passed straight through to Prisma findMany. */
  take?: number;
  skip?: number;
}

function buildItemsWhere(
  opts: Pick<ListItemsOptions, "orgId" | "search" | "groupId" | "includeInactive">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    orgId: opts.orgId,
    ...(opts.includeInactive ? {} : { status: { not: "deleted" } }),
    ...(opts.groupId ? { groupId: opts.groupId } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listItems(opts: ListItemsOptions): Promise<ItemRecord[]> {
  const rows = await (db as any).cnItem.findMany({
    where: buildItemsWhere(opts),
    include: {
      group: { select: { id: true, name: true } },
      uom: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });

  const allIds = rows.flatMap((r: any) => {
    const arr = Array.isArray(r.uomIds) && r.uomIds.length ? r.uomIds : [r.uomId];
    return arr.filter(Boolean);
  });
  const lookup = await buildUomLookup(opts.orgId, allIds);
  return rows.map((r: any) => toRecord(r, lookup));
}

export async function countItems(
  opts: Pick<ListItemsOptions, "orgId" | "search" | "includeInactive">,
): Promise<number> {
  return (db as any).cnItem.count({ where: buildItemsWhere(opts) });
}

export async function findItemById(
  orgId: string,
  id: string,
): Promise<ItemRecord | null> {
  const row = await (db as any).cnItem.findFirst({
    where: { id, orgId },
    include: {
      group: { select: { id: true, name: true } },
      uom: { select: { id: true, code: true, name: true } },
    },
  });
  if (!row) return null;
  const ids = Array.isArray(row.uomIds) && row.uomIds.length ? row.uomIds : [row.uomId];
  const lookup = await buildUomLookup(row.orgId, ids);
  return toRecord(row, lookup);
}

export interface CreateItemInput {
  orgId: string;
  createdBy: string;
  code?: string;
  name: string;
  itemType?: string;
  category?: string;
  groupName?: string;
  uomId?: string;
  uomCode?: string;
  uomIds?: string[];
  description?: string;
  specifications?: string;
  hsnCode?: string;
  gstRate?: string;
  standardRate?: string;
  minStockLevel?: string;
  reorderLevel?: string;
  status?: string;
}

export async function createItem(input: CreateItemInput): Promise<ItemRecord> {
  const record = await (db as any).$transaction(async (tx: any) => {
    const category = (input.category ?? input.groupName ?? "").trim();
    const groupId = await ensureDefaultItemGroup(tx, input.orgId, input.createdBy);

    const requestedIds: string[] = [];
    if (Array.isArray(input.uomIds) && input.uomIds.length) {
      requestedIds.push(...input.uomIds.filter(Boolean));
    } else if (input.uomId) {
      requestedIds.push(input.uomId);
    }

    const validIds: string[] = [];
    if (requestedIds.length) {
      const verified = await tx.cnUOM.findMany({
        where: {
          id: { in: requestedIds },
          orgId: input.orgId,
        },
        select: { id: true },
      });
      const seen = new Set(verified.map((u: any) => u.id));
      for (const id of requestedIds) {
        if (seen.has(id) && !validIds.includes(id)) validIds.push(id);
      }
    }

    if (validIds.length === 0 && input.uomCode) {
      validIds.push(
        await ensureUOM(
          tx,
          input.orgId,
          input.uomCode,
          input.createdBy,
        ),
      );
    }
    if (validIds.length === 0) throw new Error("UOM is required");
    const uomId = validIds[0];
    const uomIds = validIds;

    let code = (input.code ?? "").trim();
    if (!code) {
      const initials = makeItemInitials(input.name);
      const seq = await nextItemCodeSeq(tx, input.orgId);
      code = `${initials}-${String(seq).padStart(3, "0")}`;
    }

    const row = await tx.cnItem.create({
      data: {
        orgId: input.orgId,
        code,
        name: String(input.name ?? "").trim(),
        description: input.specifications ?? input.description ?? null,
        itemType: input.itemType?.trim() || null,
        groupId,
        category: category || null,
        uomId,
        uomIds,
        hsnCode: input.hsnCode ?? null,
        gstRate: input.gstRate ? input.gstRate : null,
        standardRate: input.standardRate ? input.standardRate : null,
        minStockLevel: input.minStockLevel ? input.minStockLevel : null,
        reorderLevel: input.reorderLevel ? input.reorderLevel : null,
        status: input.status ?? "active",
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
      include: {
        group: { select: { id: true, name: true } },
        uom: { select: { id: true, code: true, name: true } },
      },
    });
    return row;
  });
  const lookup = await buildUomLookup(record.orgId, record.uomIds ?? [record.uomId]);
  return toRecord(record, lookup);
}

export interface UpdateItemInput {
  updatedBy: string;
  code?: string;
  name?: string;
  itemType?: string;
  category?: string;
  groupName?: string;
  uomId?: string;
  uomCode?: string;
  uomIds?: string[];
  description?: string;
  specifications?: string;
  hsnCode?: string;
  gstRate?: string;
  standardRate?: string;
  minStockLevel?: string;
  reorderLevel?: string;
  status?: string;
}

export async function updateItem(
  orgId: string,
  id: string,
  patch: UpdateItemInput,
): Promise<ItemRecord | null> {
  const existing = await (db as any).cnItem.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await (db as any).$transaction(async (tx: any) => {
    const data: Record<string, unknown> = { updatedBy: patch.updatedBy };

    if (patch.code !== undefined) data.code = patch.code;
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.itemType !== undefined) data.itemType = patch.itemType?.trim() || null;
    if (patch.hsnCode !== undefined) data.hsnCode = patch.hsnCode;
    if (patch.gstRate !== undefined) data.gstRate = patch.gstRate || null;
    if (patch.standardRate !== undefined)
      data.standardRate = patch.standardRate || null;
    if (patch.minStockLevel !== undefined)
      data.minStockLevel = patch.minStockLevel || null;
    if (patch.reorderLevel !== undefined)
      data.reorderLevel = patch.reorderLevel || null;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.specifications !== undefined)
      data.description = patch.specifications;
    else if (patch.description !== undefined)
      data.description = patch.description;

    const category = patch.category ?? patch.groupName;
    if (category !== undefined) data.category = String(category).trim() || null;

    const requestedIds: string[] = [];
    if (Array.isArray(patch.uomIds)) {
      requestedIds.push(...patch.uomIds.filter(Boolean));
    } else if (patch.uomId) {
      requestedIds.push(patch.uomId);
    }

    if (requestedIds.length) {
      const verified = await tx.cnUOM.findMany({
        where: { id: { in: requestedIds }, orgId },
        select: { id: true },
      });
      const seen = new Set(verified.map((u: any) => u.id));
      const validIds: string[] = [];
      for (const v of requestedIds) {
        if (seen.has(v) && !validIds.includes(v)) validIds.push(v);
      }
      if (validIds.length) {
        data.uomIds = validIds;
        data.uomId = validIds[0];
      }
    } else if (patch.uomCode) {
      const id = await ensureUOM(tx, orgId, patch.uomCode, patch.updatedBy);
      data.uomIds = [id];
      data.uomId = id;
    }

    return tx.cnItem.update({
      where: { id },
      data,
      include: {
        group: { select: { id: true, name: true } },
        uom: { select: { id: true, code: true, name: true } },
      },
    });
  });
  const lookup = await buildUomLookup(row.orgId, row.uomIds ?? [row.uomId]);
  return toRecord(row, lookup);
}

export async function deleteItem(
  orgId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnItem.updateMany({
    where: { id, orgId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
