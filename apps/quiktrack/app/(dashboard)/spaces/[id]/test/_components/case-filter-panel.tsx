"use client";

import { SlidePanel } from "@quikit/ui";
import { PanelFooter } from "@/components/test/panel-footer";
import { CASE_FILTERS } from "@/lib/test/caseFilters";
import { FilterField } from "./filter-field";
import { useFilterSources } from "./use-filter-sources";
import type { CaseFilterState } from "./use-case-filters";

/**
 * The full filter panel — every field in `CASE_FILTERS`, in one scrollable list.
 *
 * A SlidePanel rather than a dropdown popover: seventeen fields (several of them
 * date-range pairs) do not fit a small popover without their own inner scroll fight,
 * and a side panel keeps the case list visible while filters are being set, so the
 * effect of each choice is visible without closing anything (QUIKTR-341: "without
 * requiring the user to navigate away from the Test Cases page").
 */
export function CaseFilterPanel({
  open,
  onClose,
  projectId,
  filters,
  activeCount,
  onSetFilter,
  onClearAll,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  filters: CaseFilterState;
  activeCount: number;
  onSetFilter: (key: (typeof CASE_FILTERS)[number]["key"], value: string | undefined) => void;
  onClearAll: () => void;
}) {
  const sources = useFilterSources(projectId);

  const optionsFor = (source: "labels" | "runs" | "statuses" | undefined) => {
    if (source === "labels") return sources.labels;
    if (source === "runs") return sources.runs;
    if (source === "statuses") return sources.statuses;
    return undefined;
  };

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Filter test cases"
      subtitle={
        activeCount > 0
          ? `${activeCount} filter${activeCount === 1 ? "" : "s"} applied`
          : "No filters applied"
      }
      footer={
        // Left-aligned with a reserved right gutter — the floating support-chat
        // bubble sits over the panel's bottom-right corner and cannot be
        // restyled or moved (it is an external widget). See PanelFooter.
        <PanelFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
          >
            Done
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={activeCount === 0}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40"
          >
            Clear all
          </button>
        </PanelFooter>
      }
    >
      <div className="space-y-4">
        {CASE_FILTERS.map((def) => {
          const value = filters[def.key];
          const isSet = Boolean(value);
          return (
            <div key={def.key}>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">{def.label}</label>
                {isSet && (
                  <button
                    type="button"
                    onClick={() => onSetFilter(def.key, undefined)}
                    className="text-[11px] text-gray-400 hover:text-gray-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              <FilterField
                def={def}
                value={value}
                onChange={(next) => onSetFilter(def.key, next)}
                options={
                  def.kind === "person"
                    ? sources.people
                    : optionsFor(def.source)
                }
              />
              {def.hint && <p className="mt-1 text-[11px] text-gray-400">{def.hint}</p>}
            </div>
          );
        })}
      </div>
    </SlidePanel>
  );
}
