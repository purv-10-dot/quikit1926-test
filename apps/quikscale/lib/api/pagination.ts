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
  return {
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
