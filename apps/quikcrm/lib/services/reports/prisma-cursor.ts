/**
 * Generic Prisma cursor iterator.
 *
 * Yields rows in batches of `pageSize` (default 1000) using cursor pagination.
 * Works with any Prisma delegate exposing `findMany({ where, orderBy, take,
 * cursor, skip, select })` — i.e. all of them.
 *
 * Tied to CSV export only — do not reuse for general listing. We always
 * order by `id asc` for stable cursoring, regardless of the sort the JSON
 * branch uses, since CSV export ordering is not user-facing.
 */

export type PrismaListDelegate<TRow> = {
  findMany: (args: {
    where?: unknown;
    orderBy?: unknown;
    take?: number;
    cursor?: { id: string };
    skip?: number;
    select?: unknown;
  }) => Promise<TRow[]>;
};

export type CursorIteratorOptions<TRow> = {
  delegate: PrismaListDelegate<TRow>;
  where: unknown;
  select?: unknown;
  pageSize?: number;
};

export async function* createPrismaCursorIterator<TRow extends { id: string }>(
  opts: CursorIteratorOptions<TRow>,
): AsyncIterable<TRow> {
  const pageSize = opts.pageSize ?? 1000;
  let cursor: string | undefined;

  while (true) {
    const args: Parameters<PrismaListDelegate<TRow>["findMany"]>[0] = {
      where: opts.where,
      orderBy: { id: "asc" },
      take: pageSize,
    };
    if (opts.select) args.select = opts.select;
    if (cursor) {
      args.cursor = { id: cursor };
      args.skip = 1;
    }

    const batch = await opts.delegate.findMany(args);
    if (batch.length === 0) return;

    for (const row of batch) yield row;

    if (batch.length < pageSize) return;
    cursor = batch[batch.length - 1].id;
  }
}
