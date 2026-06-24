/**
 * Pagination helpers for QuikScale list endpoints.
 *
 * Design choices:
 *   - The default limit is deliberately HIGH (1000) so legacy callers that
 *     don't pass `?page=` / `&limit=` keep seeing all rows for a tenant.
 *   - New callers opt in to smaller pages via query params.
 *   - Response shape adds a `meta` sidecar; the primary `data` array stays
 *     the same so existing frontend hooks don't break.
 *   - A hard `MAX_LIMIT = 1000` prevents runaway queries regardless of what
 *     the caller asks for.
 *
 * Example:
 *   const { skip, take, page, limit } = parsePagination(req);
 *   const [items, total] = await Promise.all([
 *     db.foo.findMany({ where, skip, take, orderBy }),
 *     db.foo.count({ where }),
 *   ]);
 *   return NextResponse.json(withPaginationMeta(items, total, page, limit));
 */
import type { NextRequest } from "next/server";

export const DEFAULT_LIMIT = 1000;
export const MAX_LIMIT = 1000;

export interface PaginationInput {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Convenience flag for infinite-scroll consumers (page < totalPages). */
  hasMore: boolean;
}

/**
 * Parse and clamp page/limit query params from a NextRequest. Always returns
 * safe integers:
 *   - page ≥ 1
 *   - limit ∈ [1, MAX_LIMIT]
 *
 * Non-numeric or missing params fall back to defaults.
 */
export function parsePagination(req: NextRequest): PaginationInput {
  const sp = req.nextUrl.searchParams;

  const rawPage = parseInt(sp.get("page") ?? "1", 10);
  const rawLimit = parseInt(sp.get("limit") ?? String(DEFAULT_LIMIT), 10);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, rawLimit))
    : DEFAULT_LIMIT;

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/**
 * Build the standard paginated response payload:
 *   { success: true, data: [...], meta: { page, limit, total, totalPages } }
 *
 * This is additive — existing consumers that read `data` as an array keep
 * working; new consumers read `meta.total` / `meta.totalPages` to drive
 * pagination UI.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): { success: true; data: T[]; meta: PaginationMeta } {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side LIST params — pagination + search + allow-listed sort.
//
// Shared by every list route migrated to DB-level pagination so the parsing,
// limit-capping and sort allow-listing live in ONE place. Routes still build
// their own `where`; this just hands back safe primitives.
// ─────────────────────────────────────────────────────────────────────────────
export interface ListParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
  search: string;
  sortBy: string | null;
  sortOrder: "asc" | "desc";
}

export interface ParseListOptions {
  /** Columns the client is allowed to sort by. Anything else → fallback sort. */
  sortable?: readonly string[];
  /** Page size when the caller passes none. Defaults to 10 (matches the UI). */
  defaultLimit?: number;
  /** Hard cap on page size regardless of what the client asks for. */
  maxLimit?: number;
}

/**
 * Parse `page`, `limit` (or legacy `pageSize`), `search`, `sortBy`, `sortOrder`
 * from a request. `sortBy` is returned only when it's in the `sortable`
 * allow-list (else null → caller applies its default ordering).
 */
export function parseListParams(req: NextRequest, opts: ParseListOptions = {}): ListParams {
  const sp = req.nextUrl.searchParams;
  const { sortable = [], defaultLimit = 10, maxLimit = 100 } = opts;

  const rawPage = parseInt(sp.get("page") ?? "1", 10);
  const rawLimit = parseInt(sp.get("limit") ?? sp.get("pageSize") ?? String(defaultLimit), 10);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(maxLimit, Math.max(1, rawLimit))
    : defaultLimit;

  const search = (sp.get("search") ?? "").trim();
  const sortByRaw = (sp.get("sortBy") ?? "").trim();
  const sortBy = sortable.includes(sortByRaw) ? sortByRaw : null;
  const sortOrder = sp.get("sortOrder") === "asc" ? "asc" : "desc";

  return { page, limit, skip: (page - 1) * limit, take: limit, search, sortBy, sortOrder };
}

/**
 * Build a Prisma `orderBy` array from an allow-listed `sortBy`, always
 * appending an `id` tie-breaker so rows with equal sort values keep a stable
 * order across pages (prevents the classic "row appears on two pages / gets
 * skipped" bug). `map` translates a column key into the Prisma order clause
 * (handles relation sorts); `fallback` is used when `sortBy` is null.
 */
export function buildOrderBy(
  sortBy: string | null,
  sortOrder: "asc" | "desc",
  map: (key: string, dir: "asc" | "desc") => Record<string, unknown> | Record<string, unknown>[],
  fallback: Record<string, unknown> | Record<string, unknown>[],
): Record<string, unknown>[] {
  const base = sortBy ? map(sortBy, sortOrder) : fallback;
  const arr = Array.isArray(base) ? base : [base];
  return [...arr, { id: "desc" }];
}
