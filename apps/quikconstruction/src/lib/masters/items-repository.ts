/**
 * Items master — Prisma-backed CRUD for `items`.
 *
 * Wraps raw Prisma access and enriches rows with the two relations the
 * UI expects (groupName from CnItemGroup, uomCode from CnUOM). Also
 * auto-resolves free-text "category" and "uomCode" inputs from the form
 * into the matching FK rows (creating them on demand), so the existing
 * item drawer keeps working without requiring the user to first build
 * Group/UOM masters by hand.
 *
 * One-time bootstrap: if a tenant has zero items, the first list call
 * seeds the ten canonical items shipped with the product so an empty DB
 * doesn't confuse the dropdown.
 */

import { db } from "@/lib/db/prisma";

export interface ItemRecord {
  id: string;
  tenantId: string;
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

  // Pre-existing rows have an empty uomIds[]; treat the single uomId as the
  // canonical list so the UI sees at least one entry.
  const rawIds: string[] =
    Array.isArray(row.uomIds) && row.uomIds.length ? row.uomIds : [row.uomId];
  const uniqueIds = Array.from(new Set(rawIds.filter(Boolean)));
  const uomCodes = uniqueIds.map((id) => uomLookup?.get(id) ?? (id === row.uomId ? uomCode : ""))
    .filter(Boolean);

  return {
    id: row.id,
    tenantId: row.tenantId,
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
    // Current stock isn't on the item row — it's derived from the stock
    // ledger. Surface "0" for now so the UI can render a cell; downstream
    // work can plumb a ledger aggregation through here.
    currentStock: "0",
    status: row.status,
    category: groupName,
    uomIds: uniqueIds,
    specifications: description,
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

async function buildUomLookup(
  tenantId: string,
  orgId: string,
  ids: Iterable<string>,
): Promise<Map<string, string>> {
  const wanted = Array.from(new Set(Array.from(ids).filter(Boolean)));
  if (wanted.length === 0) return new Map();
  const rows = await (db as any).cnUOM.findMany({
    where: { tenantId, orgId, id: { in: wanted } },
    select: { id: true, code: true },
  });
  return new Map(rows.map((r: any) => [r.id, r.code as string]));
}

// ─── FK find-or-create helpers ─────────────────────────────────────

async function ensureItemGroup(
  tx: any,
  tenantId: string,
  orgId: string,
  name: string,
  createdBy: string,
): Promise<string> {
  const clean = String(name ?? "").trim();
  if (!clean) throw new Error("Category (item group) is required");
  const existing = await tx.cnItemGroup.findFirst({
    where: { tenantId, orgId, name: clean },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.cnItemGroup.create({
    data: {
      tenantId,
      orgId,
      name: clean,
      createdBy,
      updatedBy: createdBy,
    },
    select: { id: true },
  });
  return created.id;
}

async function ensureUOM(
  tx: any,
  tenantId: string,
  orgId: string,
  code: string,
  createdBy: string,
): Promise<string> {
  const clean = String(code ?? "").trim().toUpperCase();
  if (!clean) throw new Error("UOM code is required");
  const existing = await tx.cnUOM.findFirst({
    where: { tenantId, orgId, code: clean },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.cnUOM.create({
    data: {
      tenantId,
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

// ─── One-time per-tenant bootstrap ─────────────────────────────────

// ─── Public API ────────────────────────────────────────────────────

export interface ListItemsOptions {
  tenantId: string;
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
  opts: Pick<ListItemsOptions, "tenantId" | "orgId" | "search" | "groupId" | "includeInactive">,
): Record<string, unknown> {
  const q = (opts.search ?? "").trim();
  return {
    tenantId: opts.tenantId,
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

  // Single batched lookup for every distinct uomId across all rows so we
  // can resolve `uomCodes` without N+1 queries.
  const allIds = rows.flatMap((r: any) => {
    const arr = Array.isArray(r.uomIds) && r.uomIds.length ? r.uomIds : [r.uomId];
    return arr.filter(Boolean);
  });
  const lookup = await buildUomLookup(opts.tenantId, opts.orgId, allIds);
  return rows.map((r: any) => toRecord(r, lookup));
}

export async function countItems(
  opts: Pick<ListItemsOptions, "tenantId" | "orgId" | "search" | "includeInactive">,
): Promise<number> {
  return (db as any).cnItem.count({ where: buildItemsWhere(opts) });
}

export async function findItemById(
  tenantId: string,
  id: string,
): Promise<ItemRecord | null> {
  const row = await (db as any).cnItem.findFirst({
    where: { id, tenantId },
    include: {
      group: { select: { id: true, name: true } },
      uom: { select: { id: true, code: true, name: true } },
    },
  });
  if (!row) return null;
  const ids = Array.isArray(row.uomIds) && row.uomIds.length ? row.uomIds : [row.uomId];
  const lookup = await buildUomLookup(row.tenantId, row.orgId, ids);
  return toRecord(row, lookup);
}

export interface CreateItemInput {
  tenantId: string;
  orgId: string;
  createdBy: string;
  code?: string;
  name: string;
  /** material | consumable | asset | tool | service — UI-validated, stored as free text for forward-compat. */
  itemType?: string;
  /** Group/category — resolved to CnItemGroup by name (create-on-miss). */
  category?: string;
  groupName?: string;
  /** UOM picked from the dropdown. Prefer uomId when the UI has it. */
  uomId?: string;
  uomCode?: string;
  /** Multi-UOM — full set of UOM IDs picked. Stored verbatim; uomId is set
   *  to uomIds[0] for legacy single-UOM consumers (stock ledger, GRN). */
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
    const groupName = input.category ?? input.groupName ?? "";
    const groupId = await ensureItemGroup(
      tx,
      input.tenantId,
      input.orgId,
      groupName,
      input.createdBy,
    );

    // Resolve the full UOM ID set. Prefer the array; fall back to single
    // uomId / uomCode for legacy callers. Each ID is verified against
    // uom; unknown ones are dropped silently.
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
          tenantId: input.tenantId,
          orgId: input.orgId,
        },
        select: { id: true },
      });
      const seen = new Set(verified.map((u: any) => u.id));
      // Preserve the caller's order so uomIds[0] stays the user's primary pick.
      for (const id of requestedIds) {
        if (seen.has(id) && !validIds.includes(id)) validIds.push(id);
      }
    }

    // No verified ID and a uomCode was supplied — fall back to ensure-by-code
    // (legacy import path / single-UOM callers).
    if (validIds.length === 0 && input.uomCode) {
      validIds.push(
        await ensureUOM(
          tx,
          input.tenantId,
          input.orgId,
          input.uomCode,
          input.createdBy,
        ),
      );
    }
    if (validIds.length === 0) throw new Error("UOM is required");
    const uomId = validIds[0];
    const uomIds = validIds;

    const code =
      (input.code ?? "").trim() ||
      `ITM-${Date.now().toString(36).toUpperCase()}`;

    const row = await tx.cnItem.create({
      data: {
        tenantId: input.tenantId,
        orgId: input.orgId,
        code,
        name: String(input.name ?? "").trim(),
        description: input.specifications ?? input.description ?? null,
        itemType: input.itemType?.trim() || null,
        groupId,
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
  const lookup = await buildUomLookup(record.tenantId, record.orgId, record.uomIds ?? [record.uomId]);
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
  tenantId: string,
  orgId: string,
  id: string,
  patch: UpdateItemInput,
): Promise<ItemRecord | null> {
  const existing = await (db as any).cnItem.findFirst({
    where: { id, tenantId },
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

    const groupName = patch.category ?? patch.groupName;
    if (groupName) {
      data.groupId = await ensureItemGroup(
        tx,
        tenantId,
        orgId,
        groupName,
        patch.updatedBy,
      );
    }

    // UOM patch — accept the full multi-select array if supplied; otherwise
    // fall back to single uomId / uomCode for legacy callers. Verified IDs
    // become the new uomIds[]; uomId is set to the first entry.
    const requestedIds: string[] = [];
    if (Array.isArray(patch.uomIds)) {
      requestedIds.push(...patch.uomIds.filter(Boolean));
    } else if (patch.uomId) {
      requestedIds.push(patch.uomId);
    }

    if (requestedIds.length) {
      const verified = await tx.cnUOM.findMany({
        where: { id: { in: requestedIds }, tenantId, orgId },
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
      const id = await ensureUOM(tx, tenantId, orgId, patch.uomCode, patch.updatedBy);
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
  const lookup = await buildUomLookup(row.tenantId, row.orgId, row.uomIds ?? [row.uomId]);
  return toRecord(row, lookup);
}

/** Soft delete — marks the item inactive so history stays intact. */
export async function deleteItem(
  tenantId: string,
  id: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await (db as any).cnItem.updateMany({
    where: { id, tenantId },
    data: { status: "inactive", updatedBy },
  });
  return res.count > 0;
}
