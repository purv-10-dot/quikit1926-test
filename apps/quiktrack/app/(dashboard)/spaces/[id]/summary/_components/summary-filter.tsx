"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { PopoverPanel } from "../../grouped-kanban/_components/cells/popover-panel";

export interface SummaryFilters {
  parents: string[];
  assignees: string[];
  statuses: string[];
  types: string[];
}

export interface FilterOptions {
  parents: Array<{ id: string; key: string; title: string }>;
  assignees: Array<{ id: string; name: string }>;
  statuses: Array<{ id: string; name: string; category: string }>;
  types: string[];
}

interface SummaryFilterProps {
  options: FilterOptions;
  value: SummaryFilters;
  onChange: (next: SummaryFilters) => void;
}

type CategoryKey = keyof SummaryFilters;

interface Option {
  value: string;
  label: string;
  muted?: boolean;
}

/** Title-case a raw work-type token, e.g. "EPIC" → "Epic", "SUBTASK" → "Subtask". */
function prettifyType(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

const CATEGORIES: Array<{ key: CategoryKey; label: string; placeholder: string }> = [
  { key: "parents", label: "Parent", placeholder: "Search parent" },
  { key: "assignees", label: "Assignee", placeholder: "Search assignee" },
  { key: "statuses", label: "Status", placeholder: "Search status" },
  { key: "types", label: "Work type", placeholder: "Search work type" },
];

/**
 * Jira-style single-panel filter for the Summary view. One "Filter" button
 * opens a popover with a left-hand category rail (Parent / Assignee / Status /
 * Work type) and, on the right, a searchable checkbox list for the active
 * category with an "N of M" footer + Clear. The parent owns `value`; every
 * toggle calls `onChange`. Data plumbing (query params, server filtering) is
 * unchanged — this is UI only.
 */
export function SummaryFilter({ options, value, onChange }: SummaryFilterProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<CategoryKey>("parents");
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const optionsByKey: Record<CategoryKey, Option[]> = useMemo(
    () => ({
      parents: [
        { value: "none", label: "No parent", muted: true },
        ...options.parents.map((p) => ({ value: p.id, label: `${p.key} ${p.title}` })),
      ],
      assignees: [
        { value: "unassigned", label: "Unassigned", muted: true },
        ...options.assignees.map((a) => ({ value: a.id, label: a.name })),
      ],
      statuses: options.statuses.map((s) => ({ value: s.id, label: s.name })),
      types: options.types.map((t) => ({ value: t, label: prettifyType(t) })),
    }),
    [options],
  );

  const totalSelected =
    value.parents.length +
    value.assignees.length +
    value.statuses.length +
    value.types.length;
  const hasSelection = totalSelected > 0;

  const activeOptions = optionsByKey[active];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? activeOptions.filter((o) => o.label.toLowerCase().includes(q))
    : activeOptions;
  const selectedSet = new Set(value[active]);

  function toggle(optionValue: string) {
    const current = value[active];
    const next = current.includes(optionValue)
      ? current.filter((v) => v !== optionValue)
      : [...current, optionValue];
    onChange({ ...value, [active]: next });
  }

  function clearActive() {
    onChange({ ...value, [active]: [] });
  }

  function clearAll() {
    onChange({ parents: [], assignees: [], statuses: [], types: [] });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium border rounded-md transition ${
            open
              ? "border-blue-400 ring-2 ring-blue-100 bg-white text-gray-900"
              : hasSelection
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter
          {hasSelection && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
              {totalSelected}
            </span>
          )}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {hasSelection && (
          <button
            type="button"
            onClick={clearAll}
            className="h-8 px-2 text-xs font-medium text-gray-500 hover:text-gray-900 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <PopoverPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        width={520}
        estimatedHeight={360}
      >
        <div className="flex h-[320px]">
          {/* Left rail — categories, with per-category selected count. */}
          <div className="w-40 shrink-0 border-r border-gray-100 py-1">
            {CATEGORIES.map((c) => {
              const count = value[c.key].length;
              const isActive = active === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setActive(c.key);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-blue-50 font-medium text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="truncate">{c.label}</span>
                  {count > 0 && (
                    <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right pane — search + checkbox list for the active category. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    CATEGORIES.find((c) => c.key === active)?.placeholder ?? "Search"
                  }
                  className="h-8 w-full rounded border border-gray-200 pl-7 pr-7 text-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-400">
                  No matches
                </div>
              ) : (
                filtered.map((o) => {
                  const isSelected = selectedSet.has(o.value);
                  return (
                    <button
                      key={o.value || "__none__"}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(o.value)}
                      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
                        isSelected
                          ? "bg-blue-50 text-blue-700"
                          : o.muted
                            ? "text-gray-500 hover:bg-gray-50"
                            : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? "border-blue-600 bg-blue-600"
                            : "border-gray-300 bg-white"
                        }`}
                        aria-hidden
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="truncate">{o.label}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer — Jira-style "N of M" + Clear for the active category. */}
            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-1.5">
              <button
                type="button"
                onClick={clearActive}
                disabled={value[active].length === 0}
                className="text-xs font-medium text-gray-500 enabled:hover:text-gray-900 enabled:hover:underline disabled:cursor-default disabled:text-gray-300"
              >
                Clear
              </button>
              <span className="text-xs text-gray-400">
                {value[active].length} of {activeOptions.length}
              </span>
            </div>
          </div>
        </div>
      </PopoverPanel>
    </>
  );
}
