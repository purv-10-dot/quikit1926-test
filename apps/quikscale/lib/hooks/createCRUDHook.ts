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
  type UseQueryOptions,
} from "@tanstack/react-query";

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

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: Partial<Item>) => createItem(body),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: keys.lists() });
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
      },
    });
  }

  function useDelete() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => deleteItem(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: keys.lists() });
      },
    });
  }

  return { keys, useList, useCreate, useUpdate, useDelete };
}
