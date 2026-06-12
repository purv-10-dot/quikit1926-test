import type { Prisma } from "@quikit/database";

/** Active vs trashed list base — merge with tenant/ACL in the route. */
export function applyContactListWhere(
  base: Prisma.CrmContactWhereInput,
  options: { trashed?: boolean },
): Prisma.CrmContactWhereInput {
  return {
    ...base,
    deletedAt: options.trashed ? { not: null } : null,
  };
}
