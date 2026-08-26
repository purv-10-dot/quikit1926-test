"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { CASE_FILTERS, isMultiFilter, type FilterDef } from "@/lib/test/caseFilters";
import { CaseFilterPanel } from "./case-filter-panel";
import { useFilterSources } from "./use-filter-sources";
import type { CaseFilterState } from "./use-case-filters";

/**
 * Filter trigger + applied-filter chips (QUIKTR-341).
 *
 * Sits in its own file so wiring it into `repository-view.tsx` costs one import and
 * one line — both files are already near the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md.
 *
 * Every applied filter renders as a chip with its own × (clear individually), plus
 * a single "Clear all" when more than one is set — the two behaviours the ticket
 * calls out as separate ("clear individual filters" AND "a Clear All option").
 */

/** Human label for one filter's current value, e.g. "High, Critical" or "TC-1042". */
function describe(def: FilterDef, value: string, resolve: (v: string) => string): string {
  if (def.kind === "enum" || def.kind === "flag") {
    const byId = new Map((def.options ?? []).map((o) => [o.value, o.label]));
    if (isMultiFilter(def)) {
      return value
        .split(",")
        .map((v) => byId.get(v) ?? v)
        .join(", ");
    }
    return byId.get(value) ?? value;
  }
  if (def.kind === "id" || def.kind === "person") {
    return value
      .split(",")
      .map(resolve)
      .join(", ");
  }
  if (def.kind === "ref") return `TC-${value}`;
  return value;
}

export function CaseFilterBar({
  projectId,
  filters,
  activeCount,
  onSetFilter,
  onClearAll,
}: {
  projectId: string;
  filters: CaseFilterState;
  activeCount: number;
  onSetFilter: (key: FilterDef["key"], value: string | undefined) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const sources = useFilterSources(projectId);

  const resolverFor = (def: FilterDef) => (v: string) => {
    if (def.key === "assignee" || def.key === "createdBy") return sources.labelFor("assignee", v);
    if (def.source === "labels") return sources.labelFor("label", v);
    if (def.source === "runs") return sources.labelFor("run", v);
    if (def.source === "statuses") return sources.labelFor("execution", v);
    return v;
  };

  const active = CASE_FILTERS.filter((d) => filters[d.key]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
          activeCount > 0
            ? "border-accent-300 bg-accent-50 text-accent-800"
            : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        <Filter className="h-3.5 w-3.5" />
        Filter
        {activeCount > 0 && (
          <span className="rounded-full bg-accent-600 px-1.5 text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {active.map((def) => (
        <span
          key={def.key}
          className="inline-flex max-w-[240px] items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] text-gray-700"
        >
          <span className="font-medium text-gray-500">{def.label}:</span>
          <span className="truncate">
            {describe(def, filters[def.key] as string, resolverFor(def))}
          </span>
          <button
            type="button"
            onClick={() => onSetFilter(def.key, undefined)}
            aria-label={`Clear ${def.label} filter`}
            className="ml-0.5 shrink-0 rounded hover:bg-gray-200"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {activeCount > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-[11px] font-medium text-gray-500 hover:text-gray-800"
        >
          Clear all
        </button>
      )}

      <CaseFilterPanel
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        filters={filters}
        activeCount={activeCount}
        onSetFilter={onSetFilter}
        onClearAll={onClearAll}
      />
    </div>
  );
}
