"use client";

import { Check, Minus, X } from "lucide-react";
import { testRef, type RunnerTest } from "./runner-types";

/**
 * Left pane — the run's work list.
 *
 * Shows a status glyph per test so a tester can see progress without reading
 * labels, matching the reference UI's ✓/✕ column. Filters are counts-aware so
 * "Failed 3" tells you whether it's worth clicking.
 */

export type RunnerFilter = "all" | "untested" | "failed" | "mine";

interface TestListPaneProps {
  tests: RunnerTest[];
  activeTestId: string | null;
  onSelect: (testId: string) => void;
  filter: RunnerFilter;
  onFilterChange: (f: RunnerFilter) => void;
  loading: boolean;
  total: number;
}

/** Compact status glyph. Colours are semantic data states, so hardcoded. */
function StatusGlyph({ statusKey }: { statusKey: string }) {
  if (statusKey === "passed" || statusKey === "automation_passed") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />;
  }
  if (
    statusKey === "failed" ||
    statusKey === "automation_failed" ||
    statusKey === "automation_error"
  ) {
    return <X className="h-3.5 w-3.5 shrink-0 text-rose-600" />;
  }
  if (statusKey === "blocked") {
    return <Minus className="h-3.5 w-3.5 shrink-0 text-gray-600" />;
  }
  if (statusKey === "skipped") {
    return <Minus className="h-3.5 w-3.5 shrink-0 text-yellow-500" />;
  }
  if (statusKey === "retest") {
    return (
      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
    );
  }
  // Untested — an empty slot keeps the column aligned without implying a result.
  return <span className="h-3.5 w-3.5 shrink-0" aria-hidden />;
}

const FILTERS: Array<{ key: RunnerFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "untested", label: "Untested" },
  { key: "failed", label: "Failed" },
  { key: "mine", label: "Mine" },
];

export function TestListPane({
  tests,
  activeTestId,
  onSelect,
  filter,
  onFilterChange,
  loading,
  total,
}: TestListPaneProps) {
  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-gray-200">
      <div className="border-b border-gray-200 px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(f.key)}
              className={`rounded px-2 py-1 text-xs ${
                filter === f.key
                  ? "bg-accent-100 font-medium text-accent-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">
          {loading ? "Loading…" : `${tests.length} of ${total} shown`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!loading && tests.length === 0 && (
          <p className="p-4 text-sm text-gray-500">
            No tests match this filter.
          </p>
        )}

        {tests.map((t) => {
          const active = t.id === activeTestId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className={`flex w-full items-start gap-2 border-b border-gray-100 px-3 py-2 text-left ${
                active ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
            >
              <StatusGlyph statusKey={t.currentStatus.key} />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm ${
                    active ? "font-medium text-blue-700" : "text-gray-800"
                  }`}
                >
                  {t.case.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-gray-400">
                  {testRef(t.refId)}
                  {t.config ? ` · ${t.config.name}` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
