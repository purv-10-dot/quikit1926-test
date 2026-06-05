import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";

export interface ProductSearchFilters {
  orgId: string;
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
  trashed?: boolean;
}

export interface ProductSearchParams extends ProductSearchFilters {
  page: number;
  pageSize: number;
}

export function buildProductSearchWhere(p: ProductSearchFilters): Prisma.CrmProductWhereInput {
  const and: Prisma.CrmProductWhereInput[] = [
    { orgId: p.orgId },
    { deletedAt: p.trashed ? { not: null } : null },
  ];
  if (p.isActive !== undefined) and.push({ isActive: p.isActive });
  if (p.sku?.trim()) and.push({ sku: { contains: p.sku.trim(), mode: "insensitive" } });
  if (p.barcode?.trim()) and.push({ barcode: { contains: p.barcode.trim(), mode: "insensitive" } });
  if (p.categoryId) and.push({ categoryId: p.categoryId });
  if (p.subcategoryId) and.push({ subcategoryId: p.subcategoryId });
  if (p.brandId) and.push({ brandId: p.brandId });
  if (p.familyId) and.push({ familyId: p.familyId });
  if (p.hsnCode?.trim()) and.push({ hsnCode: { contains: p.hsnCode.trim(), mode: "insensitive" } });
  if (p.tag?.trim()) and.push({ tags: { has: p.tag.trim() } });

  if (p.q?.trim()) {
    const q = p.q.trim();
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { hsnCode: { contains: q, mode: "insensitive" } },
        { manufacturer: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
      ],
    });
  }

  return { AND: and };
}

export async function searchProducts(p: ProductSearchParams) {
  const where = buildProductSearchWhere(p);
  const [items, total] = await Promise.all([
    prisma.crmProduct.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: {
        categoryRef: { select: { id: true, name: true } },
        brandRef: { select: { id: true, name: true } },
      },
    }),
    prisma.crmProduct.count({ where }),
  ]);
  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}
