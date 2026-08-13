import type { QceProduct } from "@prisma/client";
import { resolveGstSplit } from "@/lib/services/products/gst";
import { toNullableNumber, toNumber } from "@/lib/services/quotes/decimal";

export type SerializedProduct = ReturnType<typeof serializeProduct>;

export function serializeProduct(p: QceProduct & {
  categoryRef?: { id: string; name: string } | null;
  subcategoryRef?: { id: string; name: string } | null;
  brandRef?: { id: string; name: string } | null;
  familyRef?: { id: string; name: string } | null;
}) {
  const gstRate = toNumber(p.gstRate);
  const split = resolveGstSplit({
    gstRate,
    cgstRate: toNullableNumber(p.cgstRate),
    sgstRate: toNullableNumber(p.sgstRate),
    igstRate: toNullableNumber(p.igstRate),
  });

  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    categoryId: p.categoryId,
    subcategoryId: p.subcategoryId,
    brandId: p.brandId,
    familyId: p.familyId,
    categoryName: p.categoryRef?.name ?? p.category ?? null,
    subcategoryName: p.subcategoryRef?.name ?? null,
    brandName: p.brandRef?.name ?? null,
    familyName: p.familyRef?.name ?? null,
    barcode: p.barcode,
    tags: p.tags,
    hsnCode: p.hsnCode,
    sacCode: p.sacCode,
    unitGroup: p.unitGroup,
    defaultUnit: p.defaultUnit,
    standardCost: toNullableNumber(p.standardCost),
    listPrice: toNumber(p.listPrice),
    currency: p.currency,
    gstRate,
    cgstRate: split.cgstRate,
    sgstRate: split.sgstRate,
    igstRate: split.igstRate,
    manufacturer: p.manufacturer,
    warrantyMonths: p.warrantyMonths,
    weightKg: toNullableNumber(p.weightKg),
    lengthCm: toNullableNumber(p.lengthCm),
    widthCm: toNullableNumber(p.widthCm),
    heightCm: toNullableNumber(p.heightCm),
    serialTracked: p.serialTracked,
    dynamicFields: (p.dynamicFields as Record<string, unknown> | null) ?? null,
    description: p.description,
    imageUrl: p.imageUrl,
    productType: p.productType,
    isActive: p.isActive,
    deletedAt: p.deletedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
