"use client";

import { useEffect, useState } from "react";

export type TableName = "kpi" | "priority" | "www";

export interface TablePref {
  frozenCol: string | null;
  hiddenCols: string[];
  sort: string | null; // format: "colKey:asc" | "colKey:desc"
  colWidths: Record<string, number>;
}

interface AllPrefs {
  kpi: TablePref;
  priority: TablePref;
  www: TablePref;
}

const EMPTY_PREF: TablePref = { frozenCol: null, hiddenCols: [], sort: null, colWidths: {} };
const EMPTY_ALL: AllPrefs = { kpi: EMPTY_PREF, priority: EMPTY_PREF, www: EMPTY_PREF };

let cache: AllPrefs | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

async function fetchPreferences() {
  try {
    const res = await fetch("/api/settings/table-preferences", { cache: "no-store" });
    const json = await res.json();
    if (json.success) {
      // Ensure colWidths is always present (old records may not have it)
      const data = json.data;
      cache = {
        kpi: { ...EMPTY_PREF, ...data.kpi, colWidths: data.kpi?.colWidths ?? {} },
        priority: { ...EMPTY_PREF, ...data.priority, colWidths: data.priority?.colWidths ?? {} },
        www: { ...EMPTY_PREF, ...data.www, colWidths: data.www?.colWidths ?? {} },
      };
    } else {
      cache = EMPTY_ALL;
    }
  } catch {
    cache = EMPTY_ALL;
  }
  notifyListeners();
}

async function persist(table: TableName, partial: Partial<TablePref>) {
  const body: Record<string, unknown> = { table };
  if ("frozenCol" in partial) body.frozenCol = partial.frozenCol;
  if ("hiddenCols" in partial) body.hiddenCols = partial.hiddenCols;
  if ("sort" in partial) body.sort = partial.sort;
  if ("colWidths" in partial) body.colWidths = partial.colWidths;

  try {
    await fetch("/api/settings/table-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    fetchPreferences();
  }
}

/**
 * Unified hook for table preferences.
 * All state is persisted per-user in the DB.
 */
export function useTablePrefs(table: TableName) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    if (!cache) fetchPreferences();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const pref = cache?.[table] ?? EMPTY_PREF;

  const setFrozenCol = (col: string | null) => {
    if (!cache) cache = EMPTY_ALL;
    cache = { ...cache, [table]: { ...cache[table], frozenCol: col } };
    notifyListeners();
    persist(table, { frozenCol: col });
  };

  const hideCol = (col: string) => {
    if (!cache) cache = EMPTY_ALL;
    const current = cache[table].hiddenCols;
    if (current.includes(col)) return;
    const next = [...current, col];
    cache = { ...cache, [table]: { ...cache[table], hiddenCols: next } };
    notifyListeners();
    persist(table, { hiddenCols: next });
  };

  const showCol = (col: string) => {
    if (!cache) cache = EMPTY_ALL;
    const next = cache[table].hiddenCols.filter((c) => c !== col);
    cache = { ...cache, [table]: { ...cache[table], hiddenCols: next } };
    notifyListeners();
    persist(table, { hiddenCols: next });
  };

  const showAllCols = () => {
    if (!cache) cache = EMPTY_ALL;
    cache = { ...cache, [table]: { ...cache[table], hiddenCols: [] } };
    notifyListeners();
    persist(table, { hiddenCols: [] });
  };

  const setSort = (sort: string | null) => {
    if (!cache) cache = EMPTY_ALL;
    cache = { ...cache, [table]: { ...cache[table], sort } };
    notifyListeners();
    persist(table, { sort });
  };

  /**
   * Update a single column's width. Optimistic update + DB save.
   * Optionally pass `persistToDB = false` to skip saving (for live-drag updates).
   */
  const setColWidth = (col: string, width: number, persistToDB = true) => {
    if (!cache) cache = EMPTY_ALL;
    const nextWidths = { ...cache[table].colWidths, [col]: width };
    cache = { ...cache, [table]: { ...cache[table], colWidths: nextWidths } };
    notifyListeners();
    if (persistToDB) persist(table, { colWidths: nextWidths });
  };

  /**
   * Bulk update and persist column widths (use after drag ends to save all changes).
   */
  const saveColWidths = (widths: Record<string, number>) => {
    if (!cache) cache = EMPTY_ALL;
    cache = { ...cache, [table]: { ...cache[table], colWidths: widths } };
    notifyListeners();
    persist(table, { colWidths: widths });
  };

  return {
    frozenCol: pref.frozenCol,
    hiddenCols: pref.hiddenCols,
    sort: pref.sort,
    colWidths: pref.colWidths,
    setFrozenCol,
    hideCol,
    showCol,
    showAllCols,
    setSort,
    setColWidth,
    saveColWidths,
    loaded: cache !== null,
  };
}

/**
 * Back-compat wrapper for existing KPI code that only needs frozen col.
 */
export function useFrozenCol(table: TableName) {
  const { frozenCol, setFrozenCol, loaded } = useTablePrefs(table);
  return { frozenCol, setFrozenCol, loaded };
}
