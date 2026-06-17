import type { PaginationParams } from "@/lib/types/api";

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const sort = searchParams.get("sort") ?? undefined;
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  return { page, limit, sort, order };
}

export function paginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
