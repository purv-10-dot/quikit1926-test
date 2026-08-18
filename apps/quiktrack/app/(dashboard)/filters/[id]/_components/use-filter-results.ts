"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultToolbarStateFor, defaultTqlFor, type ToolbarState } from "./filter-toolbar";
import { useFilterPersistence } from "@/lib/hooks/usePersistentFilters";
import type { TqlErrorInfo } from "./tql-editor";

export type FilterMode = "basic" | "tql";

const MODE_STORAGE_KEY = "quiktrack.filters.tqlModeSticky";

// The page remounts per slug (`key={params.id}` in page.tsx), so component
// state can't carry "I was in TQL mode" across a sidebar navigation —
// sessionStorage is the one thing that survives the remount without also
// persisting across devices/sessions the way a server-side preference would.
function readStickyMode(): FilterMode {
  if (typeof window === "undefined") return "basic";
  return window.sessionStorage.getItem(MODE_STORAGE_KEY) === "tql" ? "tql" : "basic";
}

function writeStickyMode(mode: FilterMode): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(MODE_STORAGE_KEY, mode);
}

export interface IssueRow {
  id: string;
  key: string;
  title: string;
  type: string;
  priority: string;
  statusId: string | null;
  parentId: string | null;
  epicId: string | null;
  sprintId: string | null;
  startDate: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  eta: number | null;
  assigneeId: string | null;
  reporterId: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string; projectKey: string } | null;
  status: { id: string; name: string; color: string; category: string } | null;
  assignee: UserLite | null;
  reporter: UserLite | null;
}

interface UserLite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string | null;
}

interface ApiResponse {
  success: boolean;
  data?: IssueRow[];
  total?: number;
  meta?: { title?: string; fallback?: string };
  error?: string;
  position?: TqlErrorInfo["position"];
}

/** Either shape a saved filter's `criteria` JSON can hold. */
export type SavedCriteria = (ToolbarState & { search?: string }) | { tql: string };

function isTqlCriteria(c: SavedCriteria): c is { tql: string } {
  return typeof (c as { tql?: unknown }).tql === "string";
}

/**
 * Owns all the state/effects behind a Filters results page: the Basic vs.
 * TQL mode, the Basic toolbar/search state, the TQL query text, saved-filter
 * loading (branching on which criteria shape it holds), pagination, and the
 * actual results fetch against /api/filters/:id. Extracted out of
 * filter-view.tsx to keep that file under the 300-line component ceiling.
 */
export function useFilterResults(filterId: string) {
  const [items, setItems] = useState<IssueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [title, setTitle] = useState("");
  const [fallback, setFallback] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [tqlError, setTqlError] = useState<TqlErrorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [toolbar, setToolbar] = useState<ToolbarState>(() => defaultToolbarStateFor(filterId));
  const isSaved = filterId.startsWith("sf_");
  // A saved filter's own criteria (loaded below) decides its mode — the
  // sticky preference is only the starting point for default-filter slugs.
  const [mode, setModeState] = useState<FilterMode>(() => (isSaved ? "basic" : readStickyMode()));
  const [tql, setTql] = useState<string>(() =>
    !isSaved && readStickyMode() === "tql" ? defaultTqlFor(filterId) : "",
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // Wrap setMode so every explicit toggle (not just the initial mount read)
  // updates the sticky preference too — flipping Basic -> TQL on any filter
  // should make the next filter you visit open in TQL as well. Switching to
  // TQL on a default-filter slug (not a saved filter, and not already holding
  // some typed query) also auto-fills that slug's TQL equivalent, matching
  // Jira's Basic -> JQL translation.
  const setMode = (next: FilterMode) => {
    writeStickyMode(next);
    setModeState(next);
    if (next === "tql" && !isSaved && !tql) {
      setTql(defaultTqlFor(filterId));
    }
  };

  // A saved filter's id is prefixed `sf_`. It isn't a backend filter slug, so
  // its results query runs against the "all" base with the saved criteria
  // applied as toolbar or tql params. `savedReady` gates the results fetch
  // until the criteria have been loaded (so we don't fetch unfiltered first).
  //
  // Note: app/(dashboard)/filters/[id]/page.tsx keys <FilterView> by
  // params.id, so this whole component remounts on every slug navigation —
  // `mode`/`tql`/`toolbar`'s useState initializers above run fresh per slug
  // (reading the sticky mode preference + that slug's own TQL/toolbar
  // equivalent), which is why there's no corresponding "reseed on filterId
  // change" effect here the way there used to be.
  const resultSlug = isSaved ? "all" : filterId;
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedReady, setSavedReady] = useState(!isSaved);

  // Load a saved filter's criteria (name + toolbar/tql + search) when viewing one.
  useEffect(() => {
    if (!isSaved) {
      setSavedReady(true);
      setSavedName(null);
      return;
    }
    let alive = true;
    setSavedReady(false);
    fetch(`/api/saved-filters/${filterId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j?.success) {
          setError(j?.error ?? "Filter not found");
          setSavedReady(true);
          return;
        }
        const criteria = (j.data?.criteria ?? {}) as SavedCriteria;
        setSavedName(j.data?.name ?? "Saved filter");
        // setModeState directly, not the sticky-writing setMode — a saved
        // filter's mode is a property of that filter, not a browsing
        // preference, so opening one shouldn't overwrite what Basic/TQL the
        // user's other (default-filter) tabs should default back to.
        if (isTqlCriteria(criteria)) {
          setModeState("tql");
          setTql(criteria.tql);
        } else {
          const { search: savedSearch, ...rest } = criteria;
          setModeState("basic");
          setToolbar({
            type: [],
            statusCategory: [],
            ...(rest as Partial<ToolbarState>),
          } as ToolbarState);
          const s = typeof savedSearch === "string" ? savedSearch : "";
          setSearch(s);
          setDebounced(s);
        }
        setSavedReady(true);
      })
      .catch(() => {
        if (alive) {
          setError("Filter not found");
          setSavedReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [filterId, isSaved]);

  const toolbarQs = useMemo(() => {
    const qs = new URLSearchParams();
    if (toolbar.projectId) qs.set("projectId", toolbar.projectId);
    if (toolbar.assignee) qs.set("assignee", toolbar.assignee);
    if (toolbar.reporter) qs.set("reporter", toolbar.reporter);
    if (toolbar.type.length) qs.set("type", toolbar.type.join(","));
    if (toolbar.statusCategory.length)
      qs.set("statusCategory", toolbar.statusCategory.join(","));
    if (toolbar.resolution) qs.set("resolution", toolbar.resolution);
    if (toolbar.customFilters?.length)
      qs.set("customFilters", JSON.stringify(toolbar.customFilters));
    return qs.toString();
  }, [toolbar]);

  // Debounce the search box so we don't hammer the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Auto-persist this default filter's toolbar + search, per user, per slug (no
  // project scope, no Save button). The page remounts per slug, so each gets
  // its own row. Only meaningful in Basic mode — TQL text isn't persisted here
  // (it lives on the saved filter itself once saved).
  const persistedFilters = useMemo(
    () => ({ ...toolbar, search: debounced }),
    [toolbar, debounced],
  );
  useFilterPersistence<typeof persistedFilters>({
    viewKey: `global-${filterId}`,
    projectId: null,
    filters: persistedFilters,
    // Saved filters carry their own criteria (loaded above), so don't hydrate
    // from the per-slug view-pref — that would clobber the saved definition.
    skipHydrate: isSaved,
    applySaved: (s) => {
      const { search: savedSearch, ...rest } = s;
      setToolbar((prev) => ({ ...prev, ...(rest as Partial<ToolbarState>) }));
      if (typeof savedSearch === "string") {
        setSearch(savedSearch);
        setDebounced(savedSearch);
      }
    },
  });

  // Reset to page 1 whenever the filter, search, page size, toolbar, mode, or
  // tql text changes.
  useEffect(() => {
    setPage(1);
  }, [filterId, debounced, pageSize, toolbarQs, mode, tql]);

  useEffect(() => {
    if (!savedReady) return; // wait for saved criteria before the first fetch
    let alive = true;
    setLoading(true);
    setError(null);
    setTqlError(null);
    const qs = new URLSearchParams();
    if (mode === "tql") {
      // Set even when empty — presence of the param (not its content) is
      // what tells the API "TQL mode is active", so an empty query correctly
      // means "no filter" (all data) instead of falling back to the slug's
      // own implicit filter.
      qs.set("tql", tql);
    } else {
      new URLSearchParams(toolbarQs).forEach((v, k) => qs.set(k, v));
      if (debounced) qs.set("search", debounced);
    }
    qs.set("limit", String(pageSize));
    qs.set("offset", String((page - 1) * pageSize));
    fetch(`/api/filters/${resultSlug}?${qs}`)
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((j) => {
        if (!alive) return;
        if (!j.success) {
          if (mode === "tql") setTqlError({ message: j.error ?? "Invalid query", position: j.position });
          else setError(j.error ?? "Failed to load");
          return;
        }
        setItems(j.data ?? []);
        setTotal(j.total ?? 0);
        setTitle(savedName ?? j.meta?.title ?? "Work items");
        setFallback(j.meta?.fallback);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // mode-conditional query building intentionally reads tql/toolbarQs/debounced
    // together — see body above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultSlug, savedReady, savedName, debounced, page, pageSize, toolbarQs, mode, tql, refreshKey]);

  return {
    items,
    total,
    title,
    fallback,
    error,
    tqlError,
    loading,
    search,
    setSearch,
    debounced,
    page,
    setPage,
    pageSize,
    setPageSize,
    toolbar,
    setToolbar,
    mode,
    setMode,
    tql,
    setTql,
    refresh: () => setRefreshKey((k) => k + 1),
    isSaved,
  };
}
