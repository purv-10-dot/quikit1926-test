import type { Prisma } from "@quikit/database";

/** Active vs trashed list base — merge with tenant/ACL in the route. */
export function applyContactListWhere(
  base: Prisma.QcfContactWhereInput,
  options: { trashed?: boolean },
): Prisma.QcfContactWhereInput {
  return {
    ...base,
    deletedAt: options.trashed ? { not: null } : null,
  };
}
