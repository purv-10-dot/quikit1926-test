"use client";

/**
 * Generic DB-level list hook for pages that don't use a dedicated CRUD factory
 * (e.g. the Client Meetings modules, which previously fetched everything and
 * paginated/searched in the browser).
 *
 * Sends `page`/`limit`/`search`/`sortBy`/`sortOrder` plus any extra filter
 * params to the endpoint, expects the standard `paginatedResponse` envelope
 * (`{ success, data, meta }`), and keeps the previous page visible while the
 * next loads (no spinner flash on page/sort/search/filter changes).
 *
 *   const { data, total, totalPages, isFetching } = useServerList<ClientRow>(
 *     "client-meetings:clients",
 *     "/api/client-meetings/clients",
 *     { page, limit, search, sortBy, sortOrder, status, includeDeleted },
 *   );
 */
import { useQuery, keepPreviousData, type UseQueryOptions } from "@tanstack/react-query";

export type ServerListParams = Record<
  string,
  string | number | boolean | null | undefined
> & {
  page: number;
  limit: number;
};

interface RawPayload<T> {
  data: T[];
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

export interface ServerListResult<T> {
  data: T[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Serialise params → query string, dropping empty/nullish values. */
function toQuery(params: ServerListParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

export function useServerList<T>(
  key: string,
  endpoint: string,
  params: ServerListParams,
  options?: Omit<UseQueryOptions<RawPayload<T>, Error>, "queryKey" | "queryFn">,
): ServerListResult<T> {
  const qs = toQuery(params);
  const query = useQuery<RawPayload<T>, Error>({
    queryKey: [key, params],
    queryFn: async () => {
      const res = await fetch(`${endpoint}?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load");
      return { data: (json.data ?? []) as T[], meta: json.meta };
    },
    staleTime: 1000 * 60,
    placeholderData: keepPreviousData,
    ...options,
  });

  const meta = query.data?.meta;
  return {
    data: query.data?.data ?? [],
    total: meta?.total ?? 0,
    totalPages: meta?.totalPages ?? 1,
    page: meta?.page ?? params.page,
    limit: meta?.limit ?? params.limit,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
