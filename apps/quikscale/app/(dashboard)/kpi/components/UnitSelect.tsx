"use client";

/**
 * UnitSelect — searchable, server-paginated dropdown of Unit Master labels for
 * the Number-KPI Target Value row. Mirrors the currency-scale dropdown's slot.
 *
 *   - DB-level search (`/api/units?search=`) debounced per keystroke.
 *   - DB-level pagination via infinite scroll (loads the next page near the
 *     bottom); the list is height-capped so a scrollbar appears past ~5 rows.
 *   - "Add New" opens a small drawer (Unit Name + Description) → POST /api/units
 *     → the new unit is selected and the list refetched.
 *   - Stores the unit NAME (KPI.unit) — empty string = none.
 */

import { useState, useRef, useEffect, useCallback, type UIEvent } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Search, Check, Plus, X, Loader2 } from "lucide-react";

interface UnitItem { id: string; name: string; description: string | null }
interface UnitsPage { success: boolean; data: UnitItem[]; meta: { page: number; hasMore: boolean } }

const PAGE_SIZE = 25;
const PANEL_WIDTH = 224; // w-56

export function UnitSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // Panel is positioned `fixed` (anchored to the trigger rect) so it escapes
  // the Target-Value box's `overflow-hidden` and the scrollable modal body.
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const qc = useQueryClient();

  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(PANEL_WIDTH, r.width);
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    setCoords({ top: r.bottom + 4, left, width });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reposition while open (modal body scroll / window resize keep it aligned).
  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const query = useInfiniteQuery({
    queryKey: ["units-select", debounced],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: String(PAGE_SIZE) });
      if (debounced) params.set("search", debounced);
      const res = await fetch(`/api/units?${params}`);
      return (await res.json()) as UnitsPage;
    },
    getNextPageParam: (last) => (last?.meta?.hasMore ? last.meta.page + 1 : undefined),
    enabled: open,
  });

  const units = query.data?.pages.flatMap((p) => p.data ?? []) ?? [];

  function onScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (
      el.scrollHeight - el.scrollTop - el.clientHeight < 40 &&
      query.hasNextPage &&
      !query.isFetchingNextPage
    ) {
      void query.fetchNextPage();
    }
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 border-l border-gray-200 pl-2 pr-1.5 py-2 text-xs bg-white text-gray-600 cursor-pointer disabled:opacity-50 min-w-[88px] justify-between"
        title="Unit of measurement"
      >
        <span className={value ? "text-gray-700" : "text-gray-400"}>{value || "— Unit"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      </button>

      {open && coords && (
        <div
          className="fixed z-[300] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
          style={{ top: coords.top, left: coords.left, width: coords.width }}
        >
          {/* Search */}
          <div className="px-2.5 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search units…"
                className="flex-1 text-xs bg-transparent focus:outline-none text-gray-700 placeholder-gray-400 min-w-0"
              />
            </div>
          </div>

          {/* List — height-capped → scrollbar past ~5 rows. */}
          <div className="max-h-48 overflow-y-auto py-1" onScroll={onScroll}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50 text-left text-gray-500"
            >
              — None
              {value === "" && <Check className="h-3.5 w-3.5 text-accent-500 flex-shrink-0" />}
            </button>
            {units.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onChange(u.name); setOpen(false); setSearch(""); }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50 text-left"
                title={u.description ?? undefined}
              >
                <span className="font-medium text-gray-800 truncate">{u.name}</span>
                {value === u.name && <Check className="h-3.5 w-3.5 text-accent-500 flex-shrink-0" />}
              </button>
            ))}
            {(query.isFetchingNextPage || query.isLoading) && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300" />
              </div>
            )}
            {!query.isLoading && units.length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No units found</div>
            )}
          </div>

          {/* Add New */}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-accent-600 hover:bg-accent-50 border-t border-gray-100"
          >
            <Plus className="h-3.5 w-3.5" /> Add New
          </button>
        </div>
      )}

      {createOpen && (
        <CreateUnitModal
          onClose={() => setCreateOpen(false)}
          onCreated={(name) => {
            onChange(name);
            setCreateOpen(false);
            setOpen(false);
            setSearch("");
            qc.invalidateQueries({ queryKey: ["units-select"] });
            qc.invalidateQueries({ queryKey: ["units"] });
          }}
        />
      )}
    </div>
  );
}

// Small create drawer — Unit Name + Description → POST /api/units.
function CreateUnitModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to create unit");
      return json.data as UnitItem;
    },
    onSuccess: (item) => onCreated(item.name),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Failed to create unit"),
  });

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3.5 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Add Unit</h2>
            <p className="text-xs text-gray-500 mt-0.5">Create a new measurement unit</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <form
          className="px-5 py-4 space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (!name.trim()) { setError("Unit name is required"); return; } setError(""); create.mutate(); }}
        >
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unit Name <span className="text-red-500">*</span></label>
            <input
              autoFocus
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder="e.g. Leads, Calls, kg"
              className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 ${error ? "border-red-400" : "border-gray-200"}`}
            />
            {error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={create.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {create.isPending ? "Saving…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
