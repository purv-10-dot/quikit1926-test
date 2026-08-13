/**
 * Product Master service.
 *
 * Thin CRUD layer over QceProduct. Soft-delete is the default DELETE;
 * restore reverses it. All decimals round-trip through the Prisma Decimal
 * type — routes serialise to JSON numbers via `toNumber()`.
 */
import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { buildProductSearchWhere } from "@/lib/services/products/search";

type DbClient = typeof db | Prisma.TransactionClient;

export type ProductCreateInput = {
  name: string;
  sku: string;
  category?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  brandId?: string | null;
  familyId?: string | null;
  barcode?: string | null;
  tags?: string[];
  hsnCode?: string | null;
  sacCode?: string | null;
  unitGroup?: string;
  defaultUnit?: string;
  standardCost?: number | null;
  listPrice: number;
  currency?: string;
  gstRate: number;
  cgstRate?: number | null;
  sgstRate?: number | null;
  igstRate?: number | null;
  manufacturer?: string | null;
  warrantyMonths?: number | null;
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  serialTracked?: boolean;
  dynamicFields?: Record<string, unknown>;
  description?: string | null;
  imageUrl?: string | null;
  productType?: "Product" | "Service" | "Bundle";
  isActive?: boolean;
};

export type ProductUpdateInput = Partial<ProductCreateInput>;

const LIST_SELECT = {
  id: true,
  name: true,
  sku: true,
  category: true,
  hsnCode: true,
  unitGroup: true,
  defaultUnit: true,
  listPrice: true,
  currency: true,
  gstRate: true,
  productType: true,
  isActive: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.QceProductSelect;

export interface ListParams {
  orgId: string;
  page: number;
  pageSize: number;
  q?: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  subcategoryId?: string;
  brandId?: string;
  familyId?: string;
  tag?: string;
  hsnCode?: string;
  isActive?: boolean;
  productType?: "Product" | "Service" | "Bundle";
  trashed: boolean;
}

export function buildProductWhere(p: Omit<ListParams, "page" | "pageSize">): Prisma.QceProductWhereInput {
  const base = buildProductSearchWhere({
    orgId: p.orgId,
    q: p.q,
    sku: p.sku,
    barcode: p.barcode,
    categoryId: p.categoryId,
    subcategoryId: p.subcategoryId,
    brandId: p.brandId,
    familyId: p.familyId,
    tag: p.tag,
    hsnCode: p.hsnCode,
    isActive: p.isActive,
    trashed: p.trashed,
  });
  if (p.productType) {
    return { AND: [base, { productType: p.productType }] };
  }
  return base;
}

function mapProductInput(
  input: ProductCreateInput,
  orgId: string,
  userId?: string,
): Prisma.QceProductUncheckedCreateInput {
  return {
    orgId,
    name: input.name,
    sku: input.sku,
    category: input.category ?? null,
    categoryId: input.categoryId ?? null,
    subcategoryId: input.subcategoryId ?? null,
    brandId: input.brandId ?? null,
    familyId: input.familyId ?? null,
    barcode: input.barcode ?? null,
    tags: input.tags ?? [],
    hsnCode: input.hsnCode ?? null,
    sacCode: input.sacCode ?? null,
    unitGroup: input.unitGroup ?? "Each",
    defaultUnit: input.defaultUnit ?? input.unitGroup ?? "Each",
    standardCost: input.standardCost ?? null,
    listPrice: input.listPrice,
    currency: (input.currency ?? "INR").toUpperCase(),
    gstRate: input.gstRate,
    cgstRate: input.cgstRate ?? null,
    sgstRate: input.sgstRate ?? null,
    igstRate: input.igstRate ?? null,
    manufacturer: input.manufacturer ?? null,
    warrantyMonths: input.warrantyMonths ?? null,
    weightKg: input.weightKg ?? null,
    lengthCm: input.lengthCm ?? null,
    widthCm: input.widthCm ?? null,
    heightCm: input.heightCm ?? null,
    serialTracked: input.serialTracked ?? false,
    dynamicFields: (input.dynamicFields ?? undefined) as Prisma.InputJsonValue | undefined,
    description: input.description ?? null,
    imageUrl: input.imageUrl || null,
    productType: input.productType ?? "Product",
    isActive: input.isActive ?? true,
    ...(userId ? { createdByUserId: userId } : {}),
  };
}

export async function listProducts(p: ListParams) {
  const where = buildProductWhere(p);
  const [items, total] = await Promise.all([
    db.qceProduct.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
    db.qceProduct.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return { items, total, page: p.page, pageSize: p.pageSize, totalPages };
}

export async function getProduct(orgId: string, id: string) {
  return db.qceProduct.findFirst({ where: { id, orgId } });
}

export async function createProduct(args: {
  orgId: string;
  userId: string;
  input: ProductCreateInput;
  tx?: DbClient;
}) {
  const client: DbClient = args.tx ?? db;
  return client.qceProduct.create({
    data: mapProductInput(args.input, args.orgId, args.userId),
  });
}

export async function updateProduct(args: {
  orgId: string;
  id: string;
  input: ProductUpdateInput;
}) {
  const data: Prisma.QceProductUncheckedUpdateInput = {};
  const i = args.input;
  if (i.name !== undefined) data.name = i.name;
  if (i.sku !== undefined) data.sku = i.sku;
  if (i.category !== undefined) data.category = i.category ?? null;
  if (i.categoryId !== undefined) data.categoryId = i.categoryId ?? null;
  if (i.subcategoryId !== undefined) data.subcategoryId = i.subcategoryId ?? null;
  if (i.brandId !== undefined) data.brandId = i.brandId ?? null;
  if (i.familyId !== undefined) data.familyId = i.familyId ?? null;
  if (i.barcode !== undefined) data.barcode = i.barcode ?? null;
  if (i.tags !== undefined) data.tags = i.tags;
  if (i.hsnCode !== undefined) data.hsnCode = i.hsnCode ?? null;
  if (i.sacCode !== undefined) data.sacCode = i.sacCode ?? null;
  if (i.unitGroup !== undefined) data.unitGroup = i.unitGroup;
  if (i.defaultUnit !== undefined) data.defaultUnit = i.defaultUnit;
  if (i.standardCost !== undefined) data.standardCost = i.standardCost;
  if (i.listPrice !== undefined) data.listPrice = i.listPrice;
  if (i.currency !== undefined) data.currency = i.currency?.toUpperCase();
  if (i.gstRate !== undefined) data.gstRate = i.gstRate;
  if (i.cgstRate !== undefined) data.cgstRate = i.cgstRate ?? null;
  if (i.sgstRate !== undefined) data.sgstRate = i.sgstRate ?? null;
  if (i.igstRate !== undefined) data.igstRate = i.igstRate ?? null;
  if (i.manufacturer !== undefined) data.manufacturer = i.manufacturer ?? null;
  if (i.warrantyMonths !== undefined) data.warrantyMonths = i.warrantyMonths ?? null;
  if (i.weightKg !== undefined) data.weightKg = i.weightKg ?? null;
  if (i.lengthCm !== undefined) data.lengthCm = i.lengthCm ?? null;
  if (i.widthCm !== undefined) data.widthCm = i.widthCm ?? null;
  if (i.heightCm !== undefined) data.heightCm = i.heightCm ?? null;
  if (i.serialTracked !== undefined) data.serialTracked = i.serialTracked;
  if (i.dynamicFields !== undefined) {
    data.dynamicFields = i.dynamicFields as Prisma.InputJsonValue;
  }
  if (i.description !== undefined) data.description = i.description ?? null;
  if (i.imageUrl !== undefined) data.imageUrl = i.imageUrl || null;
  if (i.productType !== undefined) data.productType = i.productType;
  if (i.isActive !== undefined) data.isActive = i.isActive;
  return db.qceProduct.update({ where: { id: args.id, orgId: args.orgId }, data });
}

export async function softDeleteProduct(orgId: string, id: string): Promise<void> {
  await db.qceProduct.update({ where: { id, orgId }, data: { deletedAt: new Date() } });
}

export async function restoreProduct(orgId: string, id: string): Promise<void> {
  await db.qceProduct.update({ where: { id, orgId }, data: { deletedAt: null } });
}
