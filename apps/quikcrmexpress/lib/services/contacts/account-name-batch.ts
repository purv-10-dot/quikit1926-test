import { prisma } from "@/lib/db/prisma";

/**
 * For a batch of contact rows, resolve `accountName` via a single batched
 * Account lookup keyed by `accountId`. Avoids N+1 selects on the list path.
 *
 * Mirrors the legacy NestJS contacts.service.toRowsWithAccountName() helper.
 */
export async function attachAccountNames<T extends { accountId: string | null | undefined }>(
  orgId: string,
  rows: T[],
): Promise<(T & { accountName: string | null })[]> {
  if (rows.length === 0) return [];
  const ids = Array.from(
    new Set(rows.map((r) => r.accountId).filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, accountName: null }));
  }
  const accounts = await prisma.qceAccount.findMany({
    where: { orgId, id: { in: ids } },
    select: { id: true, name: true },
  });
  const byId = new Map(accounts.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    ...r,
    accountName: r.accountId ? byId.get(r.accountId) ?? null : null,
  }));
}
