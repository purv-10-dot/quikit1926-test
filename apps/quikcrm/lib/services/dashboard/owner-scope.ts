/**
 * Owner scoping for dashboard queries.
 *
 * Leads are often saved with `ownerName` (denormalized) while `ownerId` is null
 * or stale. Match by user id first, then fall back to owner name (same rule as
 * team dashboards in summary-service).
 */
import { prisma } from "@/lib/db/prisma";

export type OwnerScope = {
  userId: string;
  /** Display names / email used for name fallback matching. */
  names: string[];
};

export async function resolveOwnerScope(userId: string): Promise<OwnerScope> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true },
  });
  const names = new Set<string>();
  if (user) {
    const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    if (full) names.add(full);
    if (user.email?.trim()) names.add(user.email.trim());
  }
  return { userId, names: [...names] };
}

type OwnerFieldKeys = {
  idKey?: string;
  /** Set to `null` when the model has no denormalized name column (e.g. CrmTask). */
  nameKey?: string | null;
};

/**
 * Prisma `where` fragment: rows owned by this user (id or denormalized name).
 */
export function spreadOwnerFilter(
  scope: OwnerScope | null | undefined,
  options: OwnerFieldKeys = {},
): Record<string, unknown> {
  if (!scope) return {};
  const idKey = options.idKey ?? "ownerId";
  const nameKey = options.nameKey === undefined ? "ownerName" : options.nameKey;

  const or: Record<string, unknown>[] = [{ [idKey]: scope.userId }];

  if (nameKey && scope.names.length > 0) {
    for (const name of scope.names) {
      or.push({
        [idKey]: null,
        [nameKey]: { equals: name, mode: "insensitive" },
      });
      // Rows where ownerName was set but ownerId points elsewhere / is missing.
      or.push({
        [nameKey]: { equals: name, mode: "insensitive" },
      });
    }
  }

  return { OR: or };
}
