"use client";

import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  TypedUseSelectorHook,
  useDispatch,
  useSelector,
} from "react-redux";
import { useCallback, useEffect, useState } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Global tables slice — sort + search for every list view in QuikScale.
// One slice keyed by module name keeps a single shape, one persistence path,
// one set of reusable hooks. Add a new module by extending TABLE_MODULES; the
// type system and persistence layer pick it up automatically.
// ───────────────────────────────────────────────────────────────────────────

export const TABLE_MODULES = [
  "kpi",
  "kpiTeams",
  "priority",
  "www",
  "clientMaster",
  "clientMembers",
  "dailyHuddle",
  "weeklyMeeting",
] as const;
export type TableModule = (typeof TABLE_MODULES)[number];

export type SortOrder = "asc" | "desc";

export interface TableState {
  /** Backend sort key (e.g. "name", "owner", "progressPercent"). Empty string
   *  = "no explicit sort, use server default". */
  sortBy: string;
  sortOrder: SortOrder;
  search: string;
}

const TABLE_DEFAULTS: Record<TableModule, TableState> = {
  // Empty sortBy = manual (drag-to-reorder) mode by default — server orders by
  // the shared `position` rank, which the migration backfilled to match the old
  // createdAt-desc order, so the initial view is unchanged but row-drag works.
  // (Matches priority/www/client defaults.) A column sort still overrides it.
  kpi: { sortBy: "", sortOrder: "desc", search: "" },
  kpiTeams: { sortBy: "", sortOrder: "desc", search: "" },
  priority: { sortBy: "", sortOrder: "asc", search: "" },
  www: { sortBy: "", sortOrder: "asc", search: "" },
  clientMaster: { sortBy: "", sortOrder: "asc", search: "" },
  clientMembers: { sortBy: "", sortOrder: "asc", search: "" },
  dailyHuddle: { sortBy: "", sortOrder: "desc", search: "" },
  weeklyMeeting: { sortBy: "", sortOrder: "desc", search: "" },
};

interface TablesState {
  byModule: Record<TableModule, TableState>;
}

const tablesInitial: TablesState = {
  byModule: { ...TABLE_DEFAULTS },
};

const tablesSlice = createSlice({
  name: "tables",
  initialState: tablesInitial,
  reducers: {
    setTableSort(
      state,
      action: PayloadAction<{ module: TableModule; sortBy: string; sortOrder: SortOrder }>,
    ) {
      const { module: m, sortBy, sortOrder } = action.payload;
      state.byModule[m].sortBy = sortBy;
      state.byModule[m].sortOrder = sortOrder;
    },
    setTableSearch(
      state,
      action: PayloadAction<{ module: TableModule; search: string }>,
    ) {
      state.byModule[action.payload.module].search = action.payload.search;
    },
    resetTable(state, action: PayloadAction<TableModule>) {
      state.byModule[action.payload] = { ...TABLE_DEFAULTS[action.payload] };
    },
    /** Replace the entire slice — used by client-side rehydration. */
    hydrateTables(_state, action: PayloadAction<TablesState>) {
      return action.payload;
    },
  },
});

export const { setTableSort, setTableSearch, resetTable, hydrateTables } =
  tablesSlice.actions;

// ── Store ───────────────────────────────────────────────────────────────────

export const store = configureStore({
  reducer: {
    tables: tablesSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// ───────────────────────────────────────────────────────────────────────────
// Reusable hooks — every list page wires its table through these.
// ───────────────────────────────────────────────────────────────────────────

/** Live sort state for `module` + a setter. The setter signature matches the
 *  callback shape of <ColMenu onSort={...}> across every table component. */
export function useTableSort(module: TableModule) {
  const dispatch = useAppDispatch();
  const { sortBy, sortOrder } = useAppSelector((s) => s.tables.byModule[module]);
  const setSort = useCallback(
    (next: { sortBy: string; sortOrder: SortOrder }) => {
      dispatch(setTableSort({ module, ...next }));
    },
    [dispatch, module],
  );
  return { sortBy, sortOrder, setSort };
}

/** Live search string for `module` + a setter. Use this when you don't need
 *  a debounced controlled input (e.g. table filters with a Search button). */
export function useTableSearch(module: TableModule) {
  const dispatch = useAppDispatch();
  const search = useAppSelector((s) => s.tables.byModule[module].search);
  const setSearch = useCallback(
    (value: string) => dispatch(setTableSearch({ module, search: value })),
    [dispatch, module],
  );
  return { search, setSearch };
}

/**
 * Debounced controlled-input pattern. Returns `[inputValue, setInputValue, debouncedValue]`:
 *   - bind `inputValue` + `setInputValue` to the <input>
 *   - `debouncedValue` (Redux state) is what you pass to your data hook
 *
 * Two one-way effects keep them in sync without clobbering each other:
 *   1) Redux → local: fires on external Redux changes (esp. rehydration from
 *      localStorage after mount).
 *   2) Local → Redux: fires after `delay` ms when the user types. The
 *      `inputValue === redux` guard breaks the sync loop so a pending typing
 *      timer can't overwrite a fresh hydration.
 */
export function useDebouncedTableSearch(
  module: TableModule,
  delay = 300,
): readonly [string, (v: string) => void, string] {
  const { search, setSearch } = useTableSearch(module);
  const [input, setInput] = useState(search);

  useEffect(() => {
    setInput(search);
  }, [search]);

  useEffect(() => {
    if (input === search) return;
    const t = setTimeout(() => setSearch(input), delay);
    return () => clearTimeout(t);
  }, [input, search, delay, setSearch]);

  return [input, setInput, search] as const;
}

// ───────────────────────────────────────────────────────────────────────────
// Persistence (localStorage).
// Hydration is deferred to a useEffect on the client so the first client
// render matches the SSR HTML (no hydration mismatch). Bump STORAGE_VERSION
// when TablesState shape changes — older payloads are silently dropped.
// ───────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "quikscale.tables";
// v2: kpi/kpiTeams default sortBy changed "createdAt" → "" (manual row-order
// mode). Bumped so persisted v1 payloads (with the old default) are dropped and
// users pick up manual mode.
const STORAGE_VERSION = 2;

type PersistedPayload = { v: number; state: TablesState };

function isValidTableState(x: unknown): x is TableState {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<TableState>;
  return (
    typeof s.sortBy === "string" &&
    (s.sortOrder === "asc" || s.sortOrder === "desc") &&
    typeof s.search === "string"
  );
}

function isValidPayload(x: unknown): x is TablesState {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<TablesState>;
  if (!s.byModule || typeof s.byModule !== "object") return false;
  // Tolerate missing modules — fill with defaults below. Reject if any
  // present entry is malformed.
  for (const m of TABLE_MODULES) {
    const v = (s.byModule as Record<string, unknown>)[m];
    if (v !== undefined && !isValidTableState(v)) return false;
  }
  return true;
}

function mergeWithDefaults(persisted: TablesState): TablesState {
  const byModule = { ...TABLE_DEFAULTS } as Record<TableModule, TableState>;
  for (const m of TABLE_MODULES) {
    const v = persisted.byModule[m];
    if (v) byModule[m] = v;
  }
  return { byModule };
}

let persistInitialized = false;
let unsubscribe: (() => void) | null = null;

/** Wire up rehydration + write-through. Idempotent — safe to call from React
 *  effects on every mount; subsequent calls are no-ops. Must run only in the
 *  browser (caller is responsible for the `typeof window` check or invoking
 *  from a useEffect). */
export function initTablesPersistence(): void {
  if (persistInitialized || typeof window === "undefined") return;
  persistInitialized = true;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedPayload;
      if (parsed && parsed.v === STORAGE_VERSION && isValidPayload(parsed.state)) {
        store.dispatch(hydrateTables(mergeWithDefaults(parsed.state)));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {
    // Corrupt JSON or storage blocked — fall back to defaults.
  }

  let last: TablesState | null = null;
  unsubscribe = store.subscribe(() => {
    const current = store.getState().tables;
    if (current === last) return; // RTK returns a new ref on change
    last = current;
    try {
      const payload: PersistedPayload = { v: STORAGE_VERSION, state: current };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Quota exceeded or storage blocked — silent.
    }
  });
}

/** Test-only helper to tear down the subscriber. Not called in app code. */
export function _resetTablesPersistenceForTest(): void {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  persistInitialized = false;
}
