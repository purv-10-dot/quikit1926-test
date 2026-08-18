import type { Prisma } from "@quikit/database";

/** Active vs trashed list base — merge with tenant/ACL in the route. */
export function applyContactListWhere(
  base: Prisma.QceContactWhereInput,
  options: { trashed?: boolean },
): Prisma.QceContactWhereInput {
  return {
    ...base,
    deletedAt: options.trashed ? { not: null } : null,
  };
}
