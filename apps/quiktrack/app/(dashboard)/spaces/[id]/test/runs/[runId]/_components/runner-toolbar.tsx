"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Filter, X } from "lucide-react";
import { FilterPicker, type FilterOption } from "@quikit/ui";
import { PRIORITY_OPTIONS, RUNNER_FILTERS, type RunnerFilterKey } from "./runner-filters";
import type { RunnerCaseLabel, TestStatusLite } from "./runner-types";
import type { MemberOption } from "./assignee-picker";

/**
 * Sort + Filter bar above the runner grid (QUIKTR-341) — the reference UI's
 * "Sort: Section ▾ | Filter: Assigned To sa... ✕" row.
 *
 * A plain inline row rather than the case repository's SlidePanel: four filters
 * fit without needing a side panel, and this keeps the runner's chrome closer to
 * the reference screenshot (a filter bar directly above the grid, not a button
 * that opens something else).
 */

export type RunnerSort = "section" | "title" | "priority" | "status";

const SORT_OPTIONS: Array<{ value: RunnerSort; label: string }> = [
  { value: "section", label: "Section" },
  { value: "title", label: "Title" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
];

export function RunnerToolbar({
  sort,
  onSortChange,
  filters,
  onSetFilter,
  onClearAll,
  statuses,
  members,
  labels,
}: {
  sort: RunnerSort;
  onSortChange: (s: RunnerSort) => void;
  filters: Partial<Record<RunnerFilterKey, string>>;
  onSetFilter: (key: RunnerFilterKey, value: string | undefined) => void;
  onClearAll: () => void;
  statuses: TestStatusLite[];
  members: MemberOption[];
  labels: RunnerCaseLabel[];
}) {
  const [openFilter, setOpenFilter] = useState<RunnerFilterKey | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // FilterPicker closes ITSELF on an outside click, but that leaves OUR
  // `openFilter` state stuck open — the dropdown would then not reopen on the
  // next click of the same button (toggle sees it as already "open"). Closing
  // our own state on any outside click keeps the two in sync.
  useEffect(() => {
    if (!openFilter) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openFilter]);

  const optionsFor = (source: (typeof RUNNER_FILTERS)[number]["source"]): FilterOption[] => {
    if (source === "statuses") return statuses.map((s) => ({ value: s.id, label: s.label }));
    if (source === "people") return members.map((m) => ({ value: m.userId, label: m.name }));
    if (source === "priority") return PRIORITY_OPTIONS;
    return labels.map((l) => ({ value: l.id, label: l.name }));
  };

  const active = RUNNER_FILTERS.filter((f) => filters[f.key]);

  const describe = (def: (typeof RUNNER_FILTERS)[number]): string => {
    const opts = optionsFor(def.source);
    const raw = filters[def.key] ?? "";
    return raw
      .split(",")
      .map((v) => opts.find((o) => o.value === v)?.label ?? v)
      .join(", ");
  };

  return (
    <div ref={barRef} className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <ArrowDownUp className="h-3.5 w-3.5 text-gray-400" />
        Sort:
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as RunnerSort)}
          className="rounded border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-accent-400"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>

      <span className="h-4 w-px bg-gray-200" />

      {RUNNER_FILTERS.map((def) => (
        <div key={def.key} className="relative">
          <button
            type="button"
            onClick={() => setOpenFilter(openFilter === def.key ? null : def.key)}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
              filters[def.key]
                ? "border-accent-300 bg-accent-50 text-accent-800"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Filter className="h-3 w-3" />
            {def.label}
            {filters[def.key] && `: ${describe(def)}`}
          </button>

          {openFilter === def.key && (
            <div className="absolute left-0 top-full z-30 mt-1 w-56">
              <FilterPicker
                multiple
                values={(filters[def.key] ?? "").split(",").filter(Boolean)}
                onChangeMultiple={(vals) => {
                  onSetFilter(def.key, vals.length > 0 ? vals.join(",") : undefined);
                }}
                options={optionsFor(def.source)}
                allLabel="All"
              />
            </div>
          )}
        </div>
      ))}

      {active.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800"
        >
          <X className="h-3 w-3" />
          Clear all
        </button>
      )}
    </div>
  );
}
