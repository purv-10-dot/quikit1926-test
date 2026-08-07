import { prisma } from "@/lib/db/prisma";
import { buildProductAnalytics } from "@/lib/services/products/analytics";
import { listProductInventory, listStockMovements } from "@/lib/services/products/inventory";
import { serializeProduct } from "@/lib/services/products/serialize";
import { listProductFields } from "@/lib/services/products/fields/repo";

export async function getFullProductRecord(orgId: string, productId: string) {
  const product = await prisma.qcfProduct.findFirst({
    where: { id: productId, orgId },
    include: {
      categoryRef: { select: { id: true, name: true } },
      subcategoryRef: { select: { id: true, name: true } },
      brandRef: { select: { id: true, name: true } },
      familyRef: { select: { id: true, name: true } },
      variants: { where: { isActive: true }, orderBy: { sku: "asc" } },
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      priceListItems: {
        take: 20,
        include: { priceList: { select: { id: true, name: true, currency: true, isDefault: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!product) return null;

  const [inventory, movements, analytics, fieldDefs, quoteLines, orderLines, documents] =
    await Promise.all([
      listProductInventory(orgId, productId),
      listStockMovements(orgId, productId, 30),
      buildProductAnalytics(orgId, productId),
      listProductFields(orgId),
      prisma.qcfQuoteLine.findMany({
        where: { orgId, productId },
        select: {
          id: true,
          quoteId: true,
          productName: true,
          quantity: true,
          lineTotal: true,
          quote: { select: { quoteNumber: true, status: true, accountId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      prisma.qcfOrderLine.findMany({
        where: { orgId, productId },
        select: {
          id: true,
          orderId: true,
          productName: true,
          quantity: true,
          lineTotal: true,
          order: { select: { orderNumber: true, status: true, accountId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      prisma.qcfDocument.findMany({
        where: { orgId, refType: "product", refId: productId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  const lowStockAlerts = inventory.filter((row) => {
    if (row.lowStockThreshold == null) return false;
    const available = row.quantityOnHand - row.quantityReserved;
    return available <= row.lowStockThreshold;
  });

  return {
    product: serializeProduct(product),
    fieldDefs,
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      barcode: v.barcode,
      listPrice: v.listPrice != null ? Number(v.listPrice) : null,
      attributes: v.attributes,
      isActive: v.isActive,
    })),
    images: product.images,
    priceLists: product.priceListItems.map((pli) => ({
      id: pli.id,
      unitPrice: Number(pli.unitPrice),
      discountPct: Number(pli.discountPct),
      minQuantity: pli.minQuantity,
      priceList: pli.priceList,
    })),
    inventory: inventory.map((row) => ({
      id: row.id,
      warehouse: row.warehouse,
      variant: row.variant,
      quantityOnHand: row.quantityOnHand,
      quantityReserved: row.quantityReserved,
      quantityAvailable: row.quantityOnHand - row.quantityReserved,
      lowStockThreshold: row.lowStockThreshold,
      isLowStock:
        row.lowStockThreshold != null &&
        row.quantityOnHand - row.quantityReserved <= row.lowStockThreshold,
    })),
    stockMovements: movements.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
    lowStockAlerts,
    analytics,
    quotes: quoteLines,
    orders: orderLines,
    documents,
  };
}
