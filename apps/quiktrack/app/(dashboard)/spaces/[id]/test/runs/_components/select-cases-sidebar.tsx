"use client";

import { FilterField } from "../../_components/filter-field";
import { useFilterSources } from "../../_components/use-filter-sources";
import { PICKER_FILTERS } from "./select-cases-filters-meta";

/**
 * "Selection Filter" sidebar for `SelectCasesModal` (QUIKTR-341) — narrows the
 * middle case list by Priority/Type/Labels/Assigned To/etc.
 *
 * Reuses the case repository's own `FilterField` renderer and
 * `useFilterSources` (labels + project members), rather than a second set of
 * filter controls — the case grid's filter bar and this picker's sidebar
 * share exactly one implementation of "render a filter, turn it back into a
 * URL-shaped value", so they can never drift into different behaviours for
 * the same field.
 */
export function SelectCasesSidebar({
  projectId,
  filters,
  onSetFilter,
}: {
  projectId: string;
  filters: Partial<Record<string, string>>;
  onSetFilter: (key: string, value: string | undefined) => void;
}) {
  const sources = useFilterSources(projectId);

  const optionsFor = (def: (typeof PICKER_FILTERS)[number]) => {
    if (def.kind === "person") return sources.people;
    if (def.source === "labels") return sources.labels;
    return undefined;
  };

  // No `overflow-y-auto` here on purpose. `FilterPicker` (from @quikit/ui,
  // not modifiable per this app's rules) positions its dropdown with plain
  // CSS `absolute`, not a portal — nesting it inside a second scrollable
  // ancestor clips and mis-renders the open dropdown (it fights the parent's
  // scroll/clip box), which is exactly the broken popover the owner reported.
  // The case repository's own filter panel avoids this because its fields sit
  // at the OUTERMOST scroll level of its slide-over; this sidebar is a second,
  // nested scroll container inside the modal, so it does not get that for
  // free — the fix is to not create the second clipping context at all and
  // let the modal's own body (see select-cases-modal.tsx) be the only thing
  // that scrolls.
  return (
    <div className="w-56 shrink-0 overflow-visible border-l border-gray-200 p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Selection filter
      </h3>
      <div className="space-y-3">
        {PICKER_FILTERS.map((def) => (
          <div key={def.key}>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              {def.label}
            </label>
            <FilterField
              def={def}
              value={filters[def.key]}
              onChange={(next) => onSetFilter(def.key, next)}
              options={optionsFor(def)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
