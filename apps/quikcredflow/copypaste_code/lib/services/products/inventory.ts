import type { CrmStockMovementType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function listProductInventory(tenantId: string, productId: string) {
  return prisma.crmProductInventory.findMany({
    where: { tenantId, productId },
    include: { warehouse: { select: { id: true, name: true, code: true } }, variant: { select: { id: true, sku: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listStockMovements(tenantId: string, productId: string, limit = 50) {
  return prisma.crmStockMovement.findMany({
    where: { tenantId, productId },
    include: { warehouse: { select: { id: true, name: true } }, variant: { select: { id: true, sku: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function recordStockMovement(input: {
  tenantId: string;
  productId: string;
  warehouseId: string;
  variantId?: string | null;
  quantity: number;
  movementType: CrmStockMovementType;
  reference?: string | null;
  notes?: string | null;
  userId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const movement = await tx.crmStockMovement.create({
      data: {
        tenantId: input.tenantId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        variantId: input.variantId ?? null,
        quantity: input.quantity,
        movementType: input.movementType,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdByUserId: input.userId ?? null,
      },
    });

    const inv = await tx.crmProductInventory.findFirst({
      where: {
        tenantId: input.tenantId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        variantId: input.variantId ?? null,
      },
    });

    const deltaOnHand =
      input.movementType === "Reserve"
        ? 0
        : input.movementType === "Release"
          ? 0
          : input.quantity;
    const deltaReserved =
      input.movementType === "Reserve"
        ? input.quantity
        : input.movementType === "Release"
          ? -input.quantity
          : 0;

    if (inv) {
      await tx.crmProductInventory.update({
        where: { id: inv.id },
        data: {
          quantityOnHand: { increment: deltaOnHand },
          quantityReserved: { increment: deltaReserved },
        },
      });
    } else {
      await tx.crmProductInventory.create({
        data: {
          tenantId: input.tenantId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          variantId: input.variantId ?? null,
          quantityOnHand: Math.max(0, deltaOnHand),
          quantityReserved: Math.max(0, deltaReserved),
        },
      });
    }

    return movement;
  });
}

export async function listWarehouses(tenantId: string) {
  return prisma.crmWarehouse.findMany({
    where: { tenantId, isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function ensureDefaultWarehouse(tenantId: string) {
  const existing = await prisma.crmWarehouse.findFirst({ where: { tenantId, code: "MAIN" } });
  if (existing) return existing;
  return prisma.crmWarehouse.create({
    data: { tenantId, name: "Main Warehouse", code: "MAIN" },
  });
}
