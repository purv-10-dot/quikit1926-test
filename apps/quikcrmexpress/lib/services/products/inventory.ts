import type { QceStockMovementType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function listProductInventory(orgId: string, productId: string) {
  return prisma.qceProductInventory.findMany({
    where: { orgId, productId },
    include: { warehouse: { select: { id: true, name: true, code: true } }, variant: { select: { id: true, sku: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listStockMovements(orgId: string, productId: string, limit = 50) {
  return prisma.qceStockMovement.findMany({
    where: { orgId, productId },
    include: { warehouse: { select: { id: true, name: true } }, variant: { select: { id: true, sku: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function recordStockMovement(input: {
  orgId: string;
  productId: string;
  warehouseId: string;
  variantId?: string | null;
  quantity: number;
  movementType: QceStockMovementType;
  reference?: string | null;
  notes?: string | null;
  userId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const movement = await tx.qceStockMovement.create({
      data: {
        orgId: input.orgId,
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

    const inv = await tx.qceProductInventory.findFirst({
      where: {
        orgId: input.orgId,
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
      await tx.qceProductInventory.update({
        where: { id: inv.id },
        data: {
          quantityOnHand: { increment: deltaOnHand },
          quantityReserved: { increment: deltaReserved },
        },
      });
    } else {
      await tx.qceProductInventory.create({
        data: {
          orgId: input.orgId,
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

export async function listWarehouses(orgId: string) {
  return prisma.qceWarehouse.findMany({
    where: { orgId, isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function ensureDefaultWarehouse(orgId: string) {
  const existing = await prisma.qceWarehouse.findFirst({ where: { orgId, code: "MAIN" } });
  if (existing) return existing;
  return prisma.qceWarehouse.create({
    data: { orgId, name: "Main Warehouse", code: "MAIN" },
  });
}
