/**
 * Parse `?sortBy=<col>&sortOrder=<asc|desc>` from a request and return a
 * direction + the caller-mapped Prisma `orderBy`. Used by list endpoints
 * that expose a server-side sort whitelist.
 *
 * Callers pass a `mapper` that takes the validated column key + direction
 * and returns a Prisma `orderBy` value. This keeps relation-aware sorts
 * (e.g. `{ client: { name: dir } }`) co-located with the route's other
 * query logic instead of trying to encode them generically here.
 *
 * If `sortBy` is missing or not in the whitelist, `mapper("__default", dir)`
 * is invoked — caller decides the fallback ordering.
 */
import type { NextRequest } from "next/server";

export type SortDirection = "asc" | "desc";

export interface ParsedSort<TOrderBy> {
  sortBy: string;
  sortOrder: SortDirection;
  orderBy: TOrderBy;
}

export function parseSort<TOrderBy>(
  req: NextRequest,
  whitelist: readonly string[],
  mapper: (key: string, dir: SortDirection) => TOrderBy,
): ParsedSort<TOrderBy> {
  const sp = req.nextUrl.searchParams;
  const rawSortBy = sp.get("sortBy");
  const rawSortOrder = sp.get("sortOrder");

  const sortOrder: SortDirection = rawSortOrder === "desc" ? "desc" : "asc";
  const sortBy =
    rawSortBy && whitelist.includes(rawSortBy) ? rawSortBy : "__default";

  return {
    sortBy,
    sortOrder,
    orderBy: mapper(sortBy, sortOrder),
  };
}
