"use client";

import { useState, useCallback, useEffect, useMemo } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseTableCRUDConfig<T extends object> {
  /** Base API endpoint, e.g. "/api/org/teams" */
  apiEndpoint: string;
  /** Key used as the unique identifier (default: "id") */
  idKey?: keyof T & string;
  /** Fields to match when filtering by search query (client mode only) */
  searchFields?: (keyof T & string)[];
  /** Optional query params appended to GET, e.g. { year: "2026" } */
  fetchParams?: Record<string, string>;
  /** Transform API response before storing (default: r => r.data) */
  transformResponse?: (json: Record<string, unknown>) => T[];
  /**
   * Opt-in DB-level pagination/search/sort. When true the hook sends
   * `page`/`limit`/`search`/`sortBy`/`sortOrder` to the API, reads
   * `json.meta` ({ total, totalPages }), and treats `filtered` as the
   * already-server-filtered page (no client-side filtering). Default false
   * keeps the legacy client-side behaviour for every existing consumer.
   */
  serverPagination?: boolean;
  /** Initial page size in server mode (default 10). */
  defaultLimit?: number;
  /** Initial sort in server mode, "field:asc" | "field:desc". */
  defaultSort?: string;
}

export interface UseTableCRUDReturn<T extends object> {
  // ── Data ──
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  loading: boolean;
  refetch: () => Promise<void>;

  // ── Search & filter ──
  search: string;
  setSearch: (s: string) => void;
  filtered: T[];

  // ── Server pagination (only meaningful when serverPagination is on) ──
  page: number;
  setPage: (p: number) => void;
  limit: number;
  setLimit: (n: number) => void;
  total: number;
  totalPages: number;
  sort: string;
  setSort: (s: string) => void;

  // ── Panel / form state ──
  panelOpen: boolean;
  openCreate: () => void;
  openEdit: (item: T) => void;
  closePanel: () => void;
  editItem: T | null;
  saving: boolean;
  error: string;
  setError: (e: string) => void;

  // ── CRUD operations ──
  saveItem: (payload: Record<string, unknown>) => Promise<T | null>;
  deleteItem: (item: T) => Promise<boolean>;

  // ── Bulk selection ──
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;
  bulkDelete: () => Promise<boolean>;

  // ── Delete confirmation ──
  deleteTarget: T | null;
  setDeleteTarget: (item: T | null) => void;
  confirmDelete: () => Promise<boolean>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTableCRUD<T extends object>(
  config: UseTableCRUDConfig<T>
): UseTableCRUDReturn<T> {
  const {
    apiEndpoint,
    idKey = "id" as keyof T & string,
    searchFields = [],
    fetchParams,
    transformResponse,
    serverPagination = false,
    defaultLimit = 10,
    defaultSort = "",
  } = config;

  // ── Core state ──
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ── Server pagination state (inert in client mode) ──
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(defaultLimit);
  const [sort, setSort] = useState(defaultSort);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // Debounced search term used for the server query so we don't fire a fetch
  // on every keystroke. Client mode ignores this entirely.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    if (!serverPagination) return;
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1); // any new search starts from the first page
    }, 300);
    return () => clearTimeout(t);
  }, [search, serverPagination]);

  // ── Panel state ──
  const [panelOpen, setPanelOpen] = useState(false);
  const [editItem, setEditItem] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Selection state ──
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Delete confirmation ──
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  // ── Fetch ──
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams(fetchParams ?? {});
      if (serverPagination) {
        sp.set("page", String(page));
        sp.set("limit", String(limit));
        if (debouncedSearch) sp.set("search", debouncedSearch);
        if (sort) {
          const [field, order] = sort.split(":");
          if (field) sp.set("sortBy", field);
          if (order) sp.set("sortOrder", order);
        }
      }
      const qs = sp.toString();
      const res = await fetch(`${apiEndpoint}${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (json.success) {
        const data = transformResponse
          ? transformResponse(json)
          : (json.data as T[]);
        setItems(data);
        if (serverPagination && json.meta) {
          setTotal(json.meta.total ?? data.length);
          setTotalPages(json.meta.totalPages ?? 1);
        }
      }
    } catch {
      // silent — caller can handle via loading state
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint, fetchParams, transformResponse, serverPagination, page, limit, debouncedSearch, sort]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // ── Filtered list ──
  // In server mode the API already applied search → `items` IS the page.
  const filtered = useMemo(() => {
    if (serverPagination) return items;
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) =>
      searchFields.some((field) => {
        const val = item[field];
        return typeof val === "string" && val.toLowerCase().includes(q);
      })
    );
  }, [items, search, searchFields, serverPagination]);

  // ── Panel helpers ──
  const openCreate = useCallback(() => {
    setEditItem(null);
    setError("");
    setPanelOpen(true);
  }, []);

  const openEdit = useCallback((item: T) => {
    setEditItem(item);
    setError("");
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setEditItem(null);
    setError("");
  }, []);

  // ── Save (create or update) ──
  const saveItem = useCallback(
    async (payload: Record<string, unknown>): Promise<T | null> => {
      setSaving(true);
      setError("");
      try {
        const isEdit = editItem !== null;
        const url = isEdit
          ? `${apiEndpoint}/${(editItem as T)[idKey]}`
          : apiEndpoint;
        const res = await fetch(url, {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError(json.error || "Operation failed");
          return null;
        }
        const saved = (json.data ?? json) as T;
        if (serverPagination) {
          // Re-pull the current page so totals + ordering stay authoritative.
          await refetch();
        } else {
          // Optimistic update (client mode)
          setItems((prev) => {
            const idx = prev.findIndex(
              (x) => x[idKey] === saved[idKey]
            );
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = saved;
              return next;
            }
            return [...prev, saved];
          });
        }
        closePanel();
        return saved;
      } catch {
        setError("Network error. Please try again.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [apiEndpoint, editItem, idKey, closePanel, serverPagination, refetch]
  );

  // ── Delete single item ──
  const deleteItem = useCallback(
    async (item: T): Promise<boolean> => {
      try {
        const res = await fetch(`${apiEndpoint}/${item[idKey]}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (json.success) {
          if (serverPagination) {
            await refetch();
          } else {
            setItems((prev) =>
              prev.filter((x) => x[idKey] !== item[idKey])
            );
          }
          setDeleteTarget(null);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [apiEndpoint, idKey, serverPagination, refetch]
  );

  // ── Confirm delete (uses deleteTarget) ──
  const confirmDelete = useCallback(async (): Promise<boolean> => {
    if (!deleteTarget) return false;
    return deleteItem(deleteTarget);
  }, [deleteTarget, deleteItem]);

  // ── Selection helpers ──
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((item) => String(item[idKey])));
    });
  }, [filtered, idKey]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  // ── Bulk delete ──
  const bulkDelete = useCallback(async (): Promise<boolean> => {
    if (selected.size === 0) return false;
    try {
      const results = await Promise.all(
        [...selected].map((id) =>
          fetch(`${apiEndpoint}/${id}`, { method: "DELETE" }).then((r) =>
            r.json()
          )
        )
      );
      const deletedIds = new Set(
        results
          .filter((r) => r.success)
          .map((_r, i) => [...selected][i])
      );
      if (serverPagination) {
        await refetch();
      } else {
        setItems((prev) =>
          prev.filter((x) => !deletedIds.has(String(x[idKey])))
        );
      }
      setSelected(new Set());
      return true;
    } catch {
      return false;
    }
  }, [apiEndpoint, idKey, selected, serverPagination, refetch]);

  return {
    items,
    setItems,
    loading,
    refetch,
    search,
    setSearch,
    filtered,
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    sort,
    setSort,
    panelOpen,
    openCreate,
    openEdit,
    closePanel,
    editItem,
    saving,
    error,
    setError,
    saveItem,
    deleteItem,
    selected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    bulkDelete,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
  };
}
