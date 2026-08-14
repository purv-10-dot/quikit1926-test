/**
 * Enterprise price list service — tiers, brackets, audit, import/export.
 */
import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { logPriceListAudit } from "./price-list-audit";
import {
  activePriceListItemWhere,
  priceListItemSoftDeleteEnabled,
} from "./price-list-item-filters";

type DbClient = typeof db | Prisma.TransactionClient;

export type PriceListCreateInput = {
  name: string;
  description?: string | null;
  currency?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
  regionCode?: string | null;
  customerTier?: string | null;
};

export type PriceListUpdateInput = Partial<PriceListCreateInput>;

export type PriceListItemInput = {
  productId: string;
  unitPrice: number;
  discountPct?: number;
  minQuantity?: number;
  floorPrice?: number | null;
  notes?: string | null;
};

const LIST_SELECT = {
  id: true,
  name: true,
  description: true,
  currency: true,
  effectiveFrom: true,
  effectiveTo: true,
  isActive: true,
  isDefault: true,
  regionCode: true,
  customerTier: true,
  versionNumber: true,
  sourcePriceListId: true,
  deletedAt: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.QcePriceListSelect;

export type PriceListSortBy = "name" | "createdAt" | "updatedAt";

export interface ListParams {
  orgId: string;
  page: number;
  pageSize: number;
  q?: string;
  isActive?: boolean;
  isDefault?: boolean;
  currency?: string;
  trashed: boolean;
  sortBy?: PriceListSortBy;
  sortDir?: "asc" | "desc";
}

export function buildPriceListWhere(p: Omit<ListParams, "page" | "pageSize" | "sortBy" | "sortDir">): Prisma.QcePriceListWhereInput {
  return {
    orgId: p.orgId,
    deletedAt: p.trashed ? { not: null } : null,
    ...(p.isActive !== undefined ? { isActive: p.isActive } : {}),
    ...(p.isDefault !== undefined ? { isDefault: p.isDefault } : {}),
    ...(p.currency ? { currency: p.currency.toUpperCase() } : {}),
    ...(p.q
      ? {
          OR: [
            { name: { contains: p.q, mode: "insensitive" as const } },
            { description: { contains: p.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

function listOrderBy(p: Pick<ListParams, "sortBy" | "sortDir">): Prisma.QcePriceListOrderByWithRelationInput[] {
  const dir = p.sortDir ?? "desc";
  const primary =
    p.sortBy === "name"
      ? { name: dir }
      : p.sortBy === "updatedAt"
        ? { updatedAt: dir }
        : { createdAt: dir };
  return [primary, { isDefault: "desc" as const }];
}

export async function listPriceLists(p: ListParams) {
  const where = buildPriceListWhere(p);
  const [items, total] = await Promise.all([
    db.qcePriceList.findMany({
      where,
      select: {
        ...LIST_SELECT,
        _count: {
          select: {
            items: { where: activePriceListItemWhere() },
          },
        },
      },
      orderBy: listOrderBy(p),
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
    db.qcePriceList.count({ where }),
  ]);
  type RawRow = (typeof items)[number] & { _count: { items: number } };
  const enriched = (items as RawRow[]).map(({ _count, ...rest }) => ({
    ...rest,
    itemsCount: _count.items,
  }));
  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return { items: enriched, total, page: p.page, pageSize: p.pageSize, totalPages };
}

const ITEM_INCLUDE = {
  product: {
    select: {
      id: true,
      name: true,
      sku: true,
      listPrice: true,
      gstRate: true,
      hsnCode: true,
      unitGroup: true,
      defaultUnit: true,
    },
  },
} satisfies Prisma.QcePriceListItemInclude;

export async function getPriceList(orgId: string, id: string, opts?: { includeTrashedItems?: boolean }) {
  return db.qcePriceList.findFirst({
    where: { id, orgId },
    include: {
      items: {
        where: opts?.includeTrashedItems ? {} : activePriceListItemWhere(),
        include: ITEM_INCLUDE,
        orderBy: [{ sortOrder: "asc" }, { productId: "asc" }, { minQuantity: "asc" }],
      },
    },
  });
}

async function clearOtherDefaults(tx: DbClient, orgId: string, exceptId?: string) {
  await tx.qcePriceList.updateMany({
    where: {
      orgId,
      isDefault: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { isDefault: false },
  });
}

function assertFloorPrice(args: {
  unitPrice: number;
  floorPrice: number | null | undefined;
  allowBelowFloor: boolean;
}) {
  if (args.allowBelowFloor) return;
  if (args.floorPrice == null) return;
  if (args.unitPrice < args.floorPrice) {
    throw new PriceListItemError(
      `Unit price (${args.unitPrice}) is below the floor price (${args.floorPrice}). Manager approval required.`,
      403,
    );
  }
}

export async function createPriceList(args: {
  orgId: string;
  userId: string;
  userName?: string | null;
  input: PriceListCreateInput;
}) {
  return db.$transaction(async (tx) => {
    if (args.input.isDefault) await clearOtherDefaults(tx, args.orgId);
    const created = await tx.qcePriceList.create({
      data: {
        orgId: args.orgId,
        name: args.input.name,
        description: args.input.description ?? null,
        currency: (args.input.currency ?? "INR").toUpperCase(),
        effectiveFrom: args.input.effectiveFrom ? new Date(args.input.effectiveFrom) : null,
        effectiveTo: args.input.effectiveTo ? new Date(args.input.effectiveTo) : null,
        isActive: args.input.isActive ?? true,
        isDefault: args.input.isDefault ?? false,
        regionCode: args.input.regionCode?.trim() || null,
        customerTier: args.input.customerTier?.trim() || null,
        createdByUserId: args.userId,
        updatedByUserId: args.userId,
      },
    });
    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: created.id,
      action: "list_created",
      summary: `Created price list "${created.name}"`,
      userId: args.userId,
      userName: args.userName,
      tx,
    });
    return created;
  });
}

export async function updatePriceList(args: {
  orgId: string;
  id: string;
  userId: string;
  userName?: string | null;
  input: PriceListUpdateInput;
}) {
  return db.$transaction(async (tx) => {
    const before = await tx.qcePriceList.findFirst({
      where: { id: args.id, orgId: args.orgId },
    });
    if (!before) throw new PriceListItemError("Price list not found", 404);

    if (args.input.isDefault === true) await clearOtherDefaults(tx, args.orgId, args.id);
    const data: Prisma.QcePriceListUncheckedUpdateInput = { updatedByUserId: args.userId };
    const i = args.input;
    if (i.name !== undefined) data.name = i.name;
    if (i.description !== undefined) data.description = i.description ?? null;
    if (i.currency !== undefined) data.currency = i.currency?.toUpperCase();
    if (i.effectiveFrom !== undefined)
      data.effectiveFrom = i.effectiveFrom ? new Date(i.effectiveFrom) : null;
    if (i.effectiveTo !== undefined)
      data.effectiveTo = i.effectiveTo ? new Date(i.effectiveTo) : null;
    if (i.isActive !== undefined) data.isActive = i.isActive;
    if (i.isDefault !== undefined) data.isDefault = i.isDefault;
    if (i.regionCode !== undefined) data.regionCode = i.regionCode?.trim() || null;
    if (i.customerTier !== undefined) data.customerTier = i.customerTier?.trim() || null;

    const updated = await tx.qcePriceList.update({
      where: { id: args.id, orgId: args.orgId },
      data,
    });

    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: args.id,
      action: "list_updated",
      summary: `Updated price list "${updated.name}"`,
      userId: args.userId,
      userName: args.userName,
      tx,
    });
    return updated;
  });
}

export async function duplicatePriceList(args: {
  orgId: string;
  sourceId: string;
  userId: string;
  userName?: string | null;
  name?: string;
}) {
  return db.$transaction(async (tx) => {
    const source = await tx.qcePriceList.findFirst({
      where: { id: args.sourceId, orgId: args.orgId, deletedAt: null },
      include: {
        items: { where: activePriceListItemWhere() },
      },
    });
    if (!source) throw new PriceListItemError("Source price list not found", 404);

    const created = await tx.qcePriceList.create({
      data: {
        orgId: args.orgId,
        name: args.name?.trim() || `${source.name} (copy)`,
        description: source.description,
        currency: source.currency,
        effectiveFrom: source.effectiveFrom,
        effectiveTo: source.effectiveTo,
        isActive: false,
        isDefault: false,
        regionCode: source.regionCode,
        customerTier: source.customerTier,
        versionNumber: 1,
        sourcePriceListId: source.id,
        createdByUserId: args.userId,
        updatedByUserId: args.userId,
      },
    });

    if (source.items.length > 0) {
      await tx.qcePriceListItem.createMany({
        data: source.items.map((it) => ({
          orgId: args.orgId,
          priceListId: created.id,
          productId: it.productId,
          unitPrice: it.unitPrice,
          discountPct: it.discountPct,
          minQuantity: it.minQuantity,
          floorPrice: it.floorPrice,
          notes: it.notes,
          sortOrder: it.sortOrder,
          updatedByUserId: args.userId,
        })),
      });
    }

    await tx.qcePriceList.update({
      where: { id: source.id },
      data: { versionNumber: { increment: 1 } },
    });

    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: created.id,
      action: "list_duplicated",
      summary: `Duplicated from "${source.name}"`,
      changes: { sourcePriceListId: { from: null, to: source.id } },
      userId: args.userId,
      userName: args.userName,
      tx,
    });
    return created;
  });
}

export async function softDeletePriceList(args: {
  orgId: string;
  id: string;
  userId: string;
  userName?: string | null;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const pl = await tx.qcePriceList.update({
      where: { id: args.id, orgId: args.orgId },
      data: { deletedAt: new Date(), isDefault: false },
    });
    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: args.id,
      action: "list_deleted",
      summary: `Moved "${pl.name}" to trash`,
      userId: args.userId,
      userName: args.userName,
      tx,
    });
  });
}

export async function restorePriceList(args: {
  orgId: string;
  id: string;
  userId: string;
  userName?: string | null;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const pl = await tx.qcePriceList.update({
      where: { id: args.id, orgId: args.orgId },
      data: { deletedAt: null },
    });
    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: args.id,
      action: "list_restored",
      summary: `Restored "${pl.name}"`,
      userId: args.userId,
      userName: args.userName,
      tx,
    });
  });
}

export async function permanentDeletePriceList(orgId: string, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.qcePriceList.findFirst({
      where: { id, orgId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) {
      const err = new Error("Price list not found in trash");
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }
    await tx.qceQuote.updateMany({
      where: { orgId, priceListId: id },
      data: { priceListId: null },
    });
    await tx.qceAccount.updateMany({
      where: { orgId, defaultPriceListId: id },
      data: { defaultPriceListId: null },
    });
    await tx.qceOpportunity.updateMany({
      where: { orgId, priceListId: id },
      data: { priceListId: null },
    });
    await tx.qcePriceList.delete({ where: { id } });
  });
}

export class PriceListItemError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function assertBracketAvailable(
  tx: DbClient,
  args: { orgId: string; priceListId: string; productId: string; minQuantity: number; excludeItemId?: string },
) {
  const clash = await tx.qcePriceListItem.findFirst({
    where: activePriceListItemWhere({
      orgId: args.orgId,
      priceListId: args.priceListId,
      productId: args.productId,
      minQuantity: args.minQuantity,
      ...(args.excludeItemId ? { id: { not: args.excludeItemId } } : {}),
    }),
    select: { id: true },
  });
  if (clash) {
    throw new PriceListItemError(
      "A pricing bracket for this product and minimum quantity already exists.",
      409,
    );
  }
}

export async function addPriceListItem(args: {
  orgId: string;
  priceListId: string;
  userId: string;
  userName?: string | null;
  allowBelowFloor?: boolean;
  input: PriceListItemInput;
}) {
  return db.$transaction(async (tx) => {
    const [priceList, product] = await Promise.all([
      tx.qcePriceList.findFirst({
        where: { id: args.priceListId, orgId: args.orgId },
        select: { id: true },
      }),
      tx.qceProduct.findFirst({
        where: { id: args.input.productId, orgId: args.orgId },
        select: { id: true, listPrice: true },
      }),
    ]);
    if (!priceList) throw new PriceListItemError("Price list not found", 404);
    if (!product) throw new PriceListItemError("Product not found", 404);

    const minQuantity = args.input.minQuantity ?? 1;
    await assertBracketAvailable(tx, {
      orgId: args.orgId,
      priceListId: args.priceListId,
      productId: args.input.productId,
      minQuantity,
    });

    const floor = args.input.floorPrice ?? null;
    assertFloorPrice({
      unitPrice: args.input.unitPrice,
      floorPrice: floor,
      allowBelowFloor: args.allowBelowFloor ?? false,
    });

    const created = await tx.qcePriceListItem.create({
      data: {
        orgId: args.orgId,
        priceListId: args.priceListId,
        productId: args.input.productId,
        unitPrice: args.input.unitPrice,
        discountPct: args.input.discountPct ?? 0,
        minQuantity,
        floorPrice: floor,
        notes: args.input.notes?.trim() || null,
        updatedByUserId: args.userId,
      },
    });

    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: args.priceListId,
      itemId: created.id,
      action: "item_added",
      summary: `Added product bracket (min qty ${minQuantity})`,
      userId: args.userId,
      userName: args.userName,
      tx,
    });
    return created;
  });
}

export async function updatePriceListItem(args: {
  orgId: string;
  itemId: string;
  userId: string;
  userName?: string | null;
  allowBelowFloor?: boolean;
  input: Partial<PriceListItemInput>;
}) {
  return db.$transaction(async (tx) => {
    const existing = await tx.qcePriceListItem.findFirst({
      where: activePriceListItemWhere({ id: args.itemId, orgId: args.orgId }),
    });
    if (!existing) throw new PriceListItemError("Price list item not found", 404);

    const nextMinQty = args.input.minQuantity ?? existing.minQuantity;
    if (args.input.minQuantity !== undefined || args.input.productId !== undefined) {
      await assertBracketAvailable(tx, {
        orgId: args.orgId,
        priceListId: existing.priceListId,
        productId: args.input.productId ?? existing.productId,
        minQuantity: nextMinQty,
        excludeItemId: existing.id,
      });
    }

    const nextUnit = args.input.unitPrice ?? Number(String(existing.unitPrice));
    const nextFloor =
      args.input.floorPrice !== undefined
        ? args.input.floorPrice
        : existing.floorPrice != null
          ? Number(String(existing.floorPrice))
          : null;
    assertFloorPrice({
      unitPrice: nextUnit,
      floorPrice: nextFloor,
      allowBelowFloor: args.allowBelowFloor ?? false,
    });

    const data: Prisma.QcePriceListItemUncheckedUpdateInput = { updatedByUserId: args.userId };
    if (args.input.unitPrice !== undefined) data.unitPrice = args.input.unitPrice;
    if (args.input.discountPct !== undefined) data.discountPct = args.input.discountPct;
    if (args.input.minQuantity !== undefined) data.minQuantity = args.input.minQuantity;
    if (args.input.floorPrice !== undefined) data.floorPrice = args.input.floorPrice;
    if (args.input.notes !== undefined) data.notes = args.input.notes?.trim() || null;

    const updated = await tx.qcePriceListItem.update({
      where: { id: args.itemId },
      data,
    });

    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: existing.priceListId,
      itemId: existing.id,
      action: "item_updated",
      summary: "Updated pricing bracket",
      userId: args.userId,
      userName: args.userName,
      tx,
    });
    return updated;
  });
}

export async function duplicatePriceListItem(args: {
  orgId: string;
  itemId: string;
  userId: string;
  userName?: string | null;
}) {
  const source = await db.qcePriceListItem.findFirst({
    where: activePriceListItemWhere({ id: args.itemId, orgId: args.orgId }),
  });
  if (!source) throw new PriceListItemError("Price list item not found", 404);

  const nextMin = source.minQuantity + 1;
  return addPriceListItem({
    orgId: args.orgId,
    priceListId: source.priceListId,
    userId: args.userId,
    userName: args.userName,
    input: {
      productId: source.productId,
      unitPrice: Number(String(source.unitPrice)),
      discountPct: Number(String(source.discountPct)),
      minQuantity: nextMin,
      floorPrice: source.floorPrice != null ? Number(String(source.floorPrice)) : null,
      notes: source.notes,
    },
  });
}

export async function deletePriceListItem(args: {
  orgId: string;
  itemId: string;
  userId: string;
  userName?: string | null;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.qcePriceListItem.findFirst({
      where: activePriceListItemWhere({ id: args.itemId, orgId: args.orgId }),
    });
    if (!existing) return;
    if (priceListItemSoftDeleteEnabled()) {
      await tx.qcePriceListItem.update({
        where: { id: args.itemId },
        data: { deletedAt: new Date() },
      });
    } else {
      await tx.qcePriceListItem.deleteMany({
        where: { id: args.itemId, orgId: args.orgId },
      });
    }
    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: existing.priceListId,
      itemId: existing.id,
      action: "item_deleted",
      summary: "Removed pricing bracket",
      userId: args.userId,
      userName: args.userName,
      tx,
    });
  });
}

export async function restorePriceListItem(args: {
  orgId: string;
  itemId: string;
  userId: string;
  userName?: string | null;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    if (!priceListItemSoftDeleteEnabled()) {
      throw new PriceListItemError("Item restore requires the price list migration", 501);
    }
    const existing = await tx.qcePriceListItem.findFirst({
      where: { id: args.itemId, orgId: args.orgId, deletedAt: { not: null } },
    });
    if (!existing) throw new PriceListItemError("Trashed item not found", 404);
    await assertBracketAvailable(tx, {
      orgId: args.orgId,
      priceListId: existing.priceListId,
      productId: existing.productId,
      minQuantity: existing.minQuantity,
      excludeItemId: existing.id,
    });
    await tx.qcePriceListItem.update({
      where: { id: args.itemId },
      data: { deletedAt: null },
    });
    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: existing.priceListId,
      itemId: existing.id,
      action: "item_restored",
      summary: "Restored pricing bracket",
      userId: args.userId,
      userName: args.userName,
      tx,
    });
  });
}

export type BulkPriceAdjustMode = "percent" | "absolute";

export async function bulkUpdatePriceListItems(args: {
  orgId: string;
  priceListId: string;
  userId: string;
  userName?: string | null;
  itemIds: string[];
  mode: BulkPriceAdjustMode;
  value: number;
  allowBelowFloor?: boolean;
}) {
  return db.$transaction(async (tx) => {
    const items = await tx.qcePriceListItem.findMany({
      where: activePriceListItemWhere({
        orgId: args.orgId,
        priceListId: args.priceListId,
        id: { in: args.itemIds },
      }),
    });
    for (const it of items) {
      const current = Number(String(it.unitPrice));
      const next =
        args.mode === "percent"
          ? Math.max(0, current * (1 + args.value / 100))
          : Math.max(0, current + args.value);
      const floor = it.floorPrice != null ? Number(String(it.floorPrice)) : null;
      assertFloorPrice({ unitPrice: next, floorPrice: floor, allowBelowFloor: args.allowBelowFloor ?? false });
      await tx.qcePriceListItem.update({
        where: { id: it.id },
        data: { unitPrice: next, updatedByUserId: args.userId },
      });
    }
    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: args.priceListId,
      action: "items_bulk_updated",
      summary: `Bulk adjusted ${items.length} item(s)`,
      userId: args.userId,
      userName: args.userName,
      tx,
    });
    return { updated: items.length };
  });
}

export type ImportRow = {
  sku: string;
  unitPrice: number;
  discountPct?: number;
  minQuantity?: number;
  floorPrice?: number | null;
  notes?: string | null;
};

export async function importPriceListItems(args: {
  orgId: string;
  priceListId: string;
  userId: string;
  userName?: string | null;
  rows: ImportRow[];
  allowBelowFloor?: boolean;
}) {
  const errors: Array<{ row: number; error: string }> = [];
  let upserted = 0;
  for (let i = 0; i < args.rows.length; i++) {
    const row = args.rows[i]!;
    try {
      const product = await db.qceProduct.findFirst({
        where: { orgId: args.orgId, sku: row.sku, deletedAt: null },
        select: { id: true },
      });
      if (!product) {
        errors.push({ row: i + 2, error: `SKU not found: ${row.sku}` });
        continue;
      }
      const minQuantity = row.minQuantity ?? 1;
      const existing = await db.qcePriceListItem.findFirst({
        where: activePriceListItemWhere({
          orgId: args.orgId,
          priceListId: args.priceListId,
          productId: product.id,
          minQuantity,
        }),
      });
      if (existing) {
        await updatePriceListItem({
          orgId: args.orgId,
          itemId: existing.id,
          userId: args.userId,
          userName: args.userName,
          allowBelowFloor: args.allowBelowFloor,
          input: {
            unitPrice: row.unitPrice,
            discountPct: row.discountPct,
            floorPrice: row.floorPrice,
            notes: row.notes,
          },
        });
      } else {
        await addPriceListItem({
          orgId: args.orgId,
          priceListId: args.priceListId,
          userId: args.userId,
          userName: args.userName,
          allowBelowFloor: args.allowBelowFloor,
          input: {
            productId: product.id,
            unitPrice: row.unitPrice,
            discountPct: row.discountPct,
            minQuantity,
            floorPrice: row.floorPrice,
            notes: row.notes,
          },
        });
      }
      upserted++;
    } catch (e: unknown) {
      errors.push({
        row: i + 2,
        error: e instanceof Error ? e.message : "Import failed",
      });
    }
  }
  if (upserted > 0) {
    await logPriceListAudit({
      orgId: args.orgId,
      priceListId: args.priceListId,
      action: "items_imported",
      summary: `Imported ${upserted} row(s)`,
      userId: args.userId,
      userName: args.userName,
    });
  }
  return { upserted, errors };
}

export async function exportPriceListItems(orgId: string, priceListId: string) {
  const pl = await getPriceList(orgId, priceListId);
  if (!pl) return null;
  return pl.items.map((it) => ({
    sku: it.product?.sku ?? "",
    productName: it.product?.name ?? "",
    catalogListPrice: it.product?.listPrice != null ? Number(String(it.product.listPrice)) : null,
    unitPrice: Number(String(it.unitPrice)),
    discountPct: Number(String(it.discountPct)),
    minQuantity: it.minQuantity,
    floorPrice: it.floorPrice != null ? Number(String(it.floorPrice)) : null,
    notes: it.notes ?? "",
  }));
}

function isPriceListInWindow(
  pl: { effectiveFrom: Date | null; effectiveTo: Date | null },
  now: Date,
): boolean {
  if (pl.effectiveFrom && pl.effectiveFrom > now) return false;
  if (pl.effectiveTo && pl.effectiveTo < now) return false;
  return true;
}

export async function loadPriceListItemMap(
  orgId: string,
  priceListId: string,
  now: Date = new Date(),
): Promise<Array<{
  productId: string;
  unitPrice: number;
  discountPct: number;
  minQuantity: number;
}>> {
  const pl = await db.qcePriceList.findFirst({
    where: { id: priceListId, orgId },
    select: { effectiveFrom: true, effectiveTo: true, isActive: true },
  });
  if (!pl || !pl.isActive || !isPriceListInWindow(pl, now)) return [];

  const rows = await db.qcePriceListItem.findMany({
    where: activePriceListItemWhere({ orgId, priceListId }),
    select: {
      productId: true,
      unitPrice: true,
      discountPct: true,
      minQuantity: true,
    },
  });
  return rows.map((r) => ({
    productId: r.productId,
    unitPrice: Number(String(r.unitPrice)),
    discountPct: Number(String(r.discountPct)),
    minQuantity: r.minQuantity,
  }));
}

export async function resolvePriceForProduct(args: {
  orgId: string;
  productId: string;
  priceListId?: string | null;
  quantity: number;
  now?: Date;
}): Promise<{ unitPrice: number; discountPct: number; catalogListPrice: number } | null> {
  const now = args.now ?? new Date();
  const product = await db.qceProduct.findFirst({
    where: { id: args.productId, orgId: args.orgId },
    select: { listPrice: true },
  });
  if (!product) return null;
  const catalogListPrice = Number(String(product.listPrice));

  if (args.priceListId) {
    const pl = await db.qcePriceList.findFirst({
      where: { id: args.priceListId, orgId: args.orgId },
      select: { effectiveFrom: true, effectiveTo: true, isActive: true },
    });
    if (pl && pl.isActive && isPriceListInWindow(pl, now)) {
      const items = await db.qcePriceListItem.findMany({
        where: activePriceListItemWhere({
          orgId: args.orgId,
          priceListId: args.priceListId,
          productId: args.productId,
          minQuantity: { lte: Math.max(1, Math.floor(args.quantity)) },
        }),
        orderBy: { minQuantity: "desc" },
        take: 1,
      });
      if (items.length > 0) {
        const it = items[0]!;
        return {
          unitPrice: Number(String(it.unitPrice)),
          discountPct: Number(String(it.discountPct)),
          catalogListPrice,
        };
      }
    }
  }
  return { unitPrice: catalogListPrice, discountPct: 0, catalogListPrice };
}
