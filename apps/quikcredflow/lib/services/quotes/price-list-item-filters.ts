import type { Prisma } from "@quikit/database";
import { Prisma as PrismaRuntime } from "@prisma/client";

/** True when `prisma generate` has been run after the enterprise price-list migration. */
export function priceListItemSoftDeleteEnabled(): boolean {
  return (
    PrismaRuntime.dmmf.datamodel.models
      .find((m) => m.name === "QcfPriceListItem")
      ?.fields.some((f) => f.name === "deletedAt") ?? false
  );
}

/** Active (non-trashed) price list items — no-op filter until schema/client include `deletedAt`. */
export function activePriceListItemWhere(
  where: Prisma.QcfPriceListItemWhereInput = {},
): Prisma.QcfPriceListItemWhereInput {
  if (!priceListItemSoftDeleteEnabled()) return where;
  return { ...where, deletedAt: null };
}
