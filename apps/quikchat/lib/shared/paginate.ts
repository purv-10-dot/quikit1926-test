export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Cursor pagination helper (pure — no DB). The caller fetches `limit + 1` rows;
 * this trims to `limit` and reports the next cursor (the id of the dropped row)
 * when more remain. Centralising the +1/slice convention keeps every list
 * endpoint consistent.
 *
 * @param rows    up to `limit + 1` items, already ordered.
 * @param limit   page size (must be >= 1).
 * @param getId   extracts the cursor key from an item.
 */
export function paginate<T>(rows: T[], limit: number, getId: (row: T) => string): CursorPage<T> {
  if (limit < 1) {
    throw new RangeError(`paginate: limit must be >= 1, got ${limit}`);
  }
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last !== undefined ? getId(last) : null;
  return { items, nextCursor };
}
