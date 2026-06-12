"use client";

/**
 * Generic CRUD hook factory for tenant-scoped list resources.
 *
 * Collapses ~60% of the boilerplate shared by `useKPI`, `usePriority`, and
 * `useWWW` into a single factory that returns:
 *
 *   {
 *     keys,          // query key factory (all / lists / list / detail)
 *     useList,       // fetch N items matching a filter object
 *     useCreate,     // POST new item
 *     useUpdate,     // PUT existing item (by id)
 *     useDelete,     // DELETE existing item (by id)
 *   }
 *
 * Each resource supplies its own type, filter shape, and list-url builder,
 * so we stay type-safe while sharing the transport + cache-invalidation
 * wiring. The factory unwraps the repo's standard
 * `{ success, data }` envelope and throws an Error with the server's
 * message on failure — consumers use standard React Query `isError` /
 * `error.message` to display the result.
 *
 * Example:
 *   const www = createCRUDHook<WWWItem, WWWFilters>({
 *     resource: "www",
 *     listUrl: (f) => `/api/www${buildQuery(f)}`,
 *   });
 *   export const useWWWItems     = www.useList;
 *   export const useCreateWWW    = www.useCreate;
 *   export const useUpdateWWW    = www.useUpdate;
 *   export const useDeleteWWW    = www.useDelete;
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type UseQueryOptions,
} from "@tanstack/react-query";

/** Standard pagination meta returned by `paginatedResponse` on the server. */
export interface ListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface PaginatedList<Item> {
  data: Item[];
  meta: ListMeta;
}

export interface CRUDHookConfig<Filters> {
  /** Key prefix + base path segment (e.g. "www", "priority", "kpi") */
  resource: string;
  /**
   * Build the list URL for a given filter object. The factory supplies the
   * query-string assembly so this just returns the full URL (incl. `?`).
   */
  listUrl: (filters: Filters) => string;
  /** Default staleTime for the list query in ms. Defaults to 5 minutes. */
  staleTime?: number;
}

/**
 * Unwrap a fetch response that follows the repo's standard envelope.
 * Throws with the server error message when `success: false`.
 */
async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || fallback);
  }
  return json.data as T;
}

export function createCRUDHook<Item, Filters>(
  config: CRUDHookConfig<Filters>
) {
  const { resource, listUrl, staleTime = 1000 * 60 * 5 } = config;

  // ── Query keys ─────────────────────────────────────────────────────────
  const keys = {
    all: [resource] as const,
    lists: () => [resource, "list"] as const,
    list: (filters: Filters) => [resource, "list", filters] as const,
    details: () => [resource, "detail"] as const,
    detail: (id: string) => [resource, "detail", id] as const,
  };

  // ── Fetch helpers ──────────────────────────────────────────────────────
  async function fetchList(filters: Filters): Promise<Item[]> {
    const res = await fetch(listUrl(filters));
    return unwrap<Item[]>(res, `Failed to fetch ${resource}s`);
  }

  // Paginated variant — reads BOTH `data` and `meta` from the standard
  // `paginatedResponse` envelope. Used by list pages that drive DB-level
  // pagination/search/sort. Falls back to a single-page meta if the route
  // (older shape) returns only `data`.
  const DEFAULT_META: ListMeta = { page: 1, limit: 0, total: 0, totalPages: 1 };
  async function fetchListPaginated(filters: Filters): Promise<PaginatedList<Item>> {
    const res = await fetch(listUrl(filters));
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Failed to fetch ${resource}s`);
    const data = (json.data ?? []) as Item[];
    const meta: ListMeta = json.meta ?? { ...DEFAULT_META, total: data.length, limit: data.length };
    return { data, meta };
  }

  async function createItem(body: Partial<Item>): Promise<Item> {
    const res = await fetch(`/api/${resource}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return unwrap<Item>(res, `Failed to create ${resource}`);
  }

  async function updateItem(id: string, body: Partial<Item>): Promise<Item> {
    const res = await fetch(`/api/${resource}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return unwrap<Item>(res, `Failed to update ${resource}`);
  }

  async function deleteItem(id: string): Promise<void> {
    const res = await fetch(`/api/${resource}/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Failed to delete ${resource}`);
  }

  async function restoreItem(id: string): Promise<void> {
    const res = await fetch(`/api/${resource}/${id}/restore`, { method: "POST" });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Failed to restore ${resource}`);
  }

  async function bulkRestoreItems(ids: string[]): Promise<{ restored: number }> {
    const res = await fetch(`/api/${resource}/bulk-restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `Failed to restore ${resource}s`);
    return (json.data ?? { restored: 0 }) as { restored: number };
  }

  // ── React Query hooks ──────────────────────────────────────────────────
  function useList(
    filters: Filters,
    options?: Omit<UseQueryOptions<Item[], Error>, "queryKey" | "queryFn">
  ) {
    return useQuery({
      queryKey: keys.list(filters),
      queryFn: () => fetchList(filters),
      staleTime,
      ...options,
    });
  }

  /**
   * DB-level paginated list. Returns `{ data, meta }` and keeps the previous
   * page's data visible while the next page loads (no spinner flash on
   * page/sort/search changes).
   */
  function useListPaginated(
    filters: Filters,
    options?: Omit<UseQueryOptions<PaginatedList<Item>, Error>, "queryKey" | "queryFn">
  ) {
    return useQuery({
      queryKey: [...keys.list(filters), "paginated"] as const,
      queryFn: () => fetchListPaginated(filters),
      staleTime,
      placeholderData: keepPreviousData,
      ...options,
    });
  }

  // Dashboard summary aggregates KPI + Priority + WWW in one cached payload
  // (`useDashboardSummary`, key prefix `["dashboard"]`, staleTime 5min). Any
  // resource mutation must invalidate it too — otherwise navigating to the
  // dashboard right after creating/editing a row shows stale data until the
  // staleTime expires or the user hard-refreshes.
  const DASHBOARD_KEY = ["dashboard"] as const;

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: Partial<Item>) => createItem(body),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: keys.lists() });
        queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      },
    });
  }

  function useUpdate(id: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: Partial<Item>) => updateItem(id, body),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: keys.detail(id) });
        queryClient.invalidateQueries({ queryKey: keys.lists() });
        queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      },
    });
  }

  function useDelete() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => deleteItem(id),
      onSuccess: (_data, id) => {
        // Bust the detail cache too — a tab open on the just-deleted row
        // would otherwise keep rendering stale data from before the delete.
        queryClient.invalidateQueries({ queryKey: keys.detail(id) });
        queryClient.invalidateQueries({ queryKey: keys.lists() });
        queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      },
    });
  }

  // ── Restore (undo soft-delete) ─────────────────────────────────────────
  // POST `/api/${resource}/${id}/restore` (single) and POST
  // `/api/${resource}/bulk-restore` (many). Both invalidate the list cache
  // AND the dashboard cache so trash-mode and active-mode lists refresh.
  function useRestore() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => restoreItem(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: keys.lists() });
        queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      },
    });
  }

  function useBulkRestore() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (ids: string[]) => bulkRestoreItems(ids),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: keys.lists() });
        queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY });
      },
    });
  }

  return { keys, useList, useListPaginated, useCreate, useUpdate, useDelete, useRestore, useBulkRestore };
}
