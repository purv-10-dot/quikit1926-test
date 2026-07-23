/**
 * Pagination helpers for list endpoints.
 *
 * Reads `?page=` (1-indexed) and `?pageSize=` from a NextRequest URL,
 * clamps them to safe ranges, and returns Prisma-friendly `take` / `skip`
 * + a response shaper that wraps results in a stable envelope.
 *
 * Backwards-compat: when neither query param is present, the helper
 * returns a permissive default (`take: DEFAULT_PAGE_SIZE`, `skip: 0`)
 * AND `paginated: false`. Routes can preserve the legacy "return everything"
 * shape in that case by checking `paginated`. New callers always pass
 * `?page=1` so they get the explicit envelope.
 *
 * Hard cap of MAX_PAGE_SIZE prevents a misconfigured client from asking
 * for the whole table in one shot.
 */

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

export interface PaginationParams {
  /** True when the request actually asked for pagination (?page or ?pageSize present). */
  paginated: boolean;
  /** 1-indexed page number, ≥ 1. */
  page: number;
  /** Rows per page, clamped to [1, MAX_PAGE_SIZE]. */
  pageSize: number;
  /** For Prisma `findMany({ take, skip })`. */
  take: number;
  /** For Prisma `findMany({ take, skip })`. */
  skip: number;
}

/**
 * Parse pagination from a request URL. Pass either a NextRequest, a URL,
 * or a URLSearchParams.
 *
 * Defaults:
 *   - missing: paginated=false, page=1, pageSize=DEFAULT_PAGE_SIZE
 *   - present but invalid: clamp to nearest valid value, paginated=true
 */
export function parsePagination(
  source: { url: string } | URL | URLSearchParams,
): PaginationParams {
  let params: URLSearchParams;
  if (source instanceof URLSearchParams) {
    params = source;
  } else if (source instanceof URL) {
    params = source.searchParams;
  } else {
    params = new URL(source.url).searchParams;
  }

  const rawPage = params.get("page");
  const rawSize = params.get("pageSize");
  const paginated = rawPage !== null || rawSize !== null;

  let page = parseInt(rawPage ?? "1", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let pageSize = parseInt(rawSize ?? String(DEFAULT_PAGE_SIZE), 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return {
    paginated,
    page,
    pageSize,
    take: pageSize,
    skip: (page - 1) * pageSize,
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Wrap rows + total count from `Prisma.$transaction([findMany, count])`
 *  into the standard paginated envelope. */
export function paginatedResponse<T>(
  rows: T[],
  total: number,
  p: PaginationParams,
): PaginatedResponse<T> {
  return {
    data: rows,
    total,
    page: p.page,
    pageSize: p.pageSize,
    hasMore: p.skip + rows.length < total,
  };
}

/**
 * Slice an in-memory array into the standard pagination envelope. Use
 * for routes whose repos don't yet support push-down `take`/`skip`,
 * or for small lookup tables where loading the full set is cheap and
 * pagination is just about the response shape (so the UI can use the
 * same renderer everywhere).
 *
 * Returns the legacy `{data, total}` shape when the request didn't ask
 * for pagination (?page / ?pageSize absent).
 */
export function paginateInMemory<T>(
  rows: T[],
  p: PaginationParams,
): { data: T[]; total: number; page?: number; pageSize?: number; hasMore?: boolean } {
  if (!p.paginated) return { data: rows, total: rows.length };
  const sliced = rows.slice(p.skip, p.skip + p.take);
  return {
    data: sliced,
    total: rows.length,
    page: p.page,
    pageSize: p.pageSize,
    hasMore: p.skip + sliced.length < rows.length,
  };
}

/**
 * Run a paginated DB-backed list. Pair with a repo's `listX(opts)` and
 * `countX(opts)` to push the LIMIT/OFFSET + COUNT down to Postgres
 * instead of slicing in memory. The two queries run in parallel.
 *
 *   const result = await paginateDb(
 *     parsePagination(req),
 *     (paging) => listCompanies({ ...opts, ...paging }),
 *     () => countCompanies(opts),
 *   );
 *
 * When the request didn't ask for pagination (?page / ?pageSize absent),
 * the count call is skipped and the helper returns the legacy
 * `{ data, total: data.length }` shape.
 */
export async function paginateDb<T>(
  p: PaginationParams,
  list: (paging: { take?: number; skip?: number }) => Promise<T[]>,
  count: () => Promise<number>,
): Promise<{ data: T[]; total: number; page?: number; pageSize?: number; hasMore?: boolean }> {
  if (!p.paginated) {
    const data = await list({});
    return { data, total: data.length };
  }
  const [data, total] = await Promise.all([
    list({ take: p.take, skip: p.skip }),
    count(),
  ]);
  return {
    data,
    total,
    page: p.page,
    pageSize: p.pageSize,
    hasMore: p.skip + data.length < total,
  };
}

// ─── Sorting ──────────────────────────────────────────────────────────

/** A Prisma-ready `orderBy` clause (single column + a stable `id` tie-break). */
export type OrderByClause = Array<Record<string, "asc" | "desc">>;

export interface SortParams {
  /** The column that was actually applied (whitelisted or fallback). */
  sortBy: string;
  sortOrder: "asc" | "desc";
  /** Spread straight into a Prisma `findMany({ orderBy })`. */
  orderBy: OrderByClause;
}

/** Pull a URLSearchParams out of any of the accepted source shapes. */
function toSearchParams(
  source: { url: string } | URL | URLSearchParams,
): URLSearchParams {
  if (source instanceof URLSearchParams) return source;
  if (source instanceof URL) return source.searchParams;
  return new URL(source.url).searchParams;
}

/**
 * Parse `?sortBy=&sortOrder=` into a safe Prisma `orderBy`.
 *
 * `sortBy` is validated against an explicit `allowed` whitelist so a client
 * can never sort on a non-indexed / relation column (or inject a field name).
 * Anything invalid falls back to `fallback`. A stable `{ id: "asc" }`
 * tie-break is always appended (unless the sort column IS `id`) so pages
 * don't drift when the primary sort has duplicate values.
 *
 *   const { orderBy } = parseSort(req, ["name", "createdAt", "status"], {
 *     field: "createdAt",
 *     order: "desc",
 *   });
 *   listCompanies({ ...opts, ...paging, orderBy });
 */
export function parseSort(
  source: { url: string } | URL | URLSearchParams,
  allowed: readonly string[],
  fallback: { field: string; order?: "asc" | "desc" },
): SortParams {
  const params = toSearchParams(source);
  const rawBy = params.get("sortBy");
  const rawOrder = params.get("sortOrder");

  const sortOrder: "asc" | "desc" =
    rawOrder === "asc" ? "asc" : rawOrder === "desc" ? "desc" : fallback.order ?? "desc";

  const sortBy = rawBy && allowed.includes(rawBy) ? rawBy : fallback.field;

  const orderBy: OrderByClause =
    sortBy === "id"
      ? [{ id: sortOrder }]
      : [{ [sortBy]: sortOrder }, { id: "asc" }];

  return { sortBy, sortOrder, orderBy };
}
