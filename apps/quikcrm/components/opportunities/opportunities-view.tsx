"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { AddButton } from "@quikit/ui";
import { OpportunityKanban } from "./opportunity-kanban";
import { OpportunityListTable } from "./opportunity-list-table";
import { OpportunityFormDrawer } from "./opportunity-form-drawer";
import {
  OpportunityAdvancedFilterModal,
  OpportunityAppliedFilterSummary,
} from "./opportunity-advanced-filter";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { OPPORTUNITY_FILTER_FIELDS } from "@/lib/opportunity-filter-fields";
import type { FilterPayload } from "@/types/lead-filter";

type View = "pipeline" | "list";

const EMPTY_FILTER: FilterPayload = { matchMode: "ALL", conditions: [] };

export function OpportunitiesView() {
  const [view, setView] = useState<View>("pipeline");
  const [createOpen, setCreateOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [filter, setFilter] = useState<FilterPayload>(EMPTY_FILTER);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ownerOptions, setOwnerOptions] = useState<{ value: string; label: string }[]>([]);

  const filterActive = filter.conditions.length > 0;
  const searchActive = debouncedSearch.trim().length > 0;
  const filterKey = useMemo(
    () => JSON.stringify({ filter, search: debouncedSearch.trim() }),
    [filter, debouncedSearch],
  );

  const didMountRef = useRef(false);
  const [listResetToken, setListResetToken] = useState(0);

  useEffect(() => {
    void fetch("/api/users/picker", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { items?: { name: string }[] } | null) => {
        if (!j?.items?.length) return;
        setOwnerOptions(j.items.map((u) => ({ value: u.name, label: u.name })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setListResetToken((t) => t + 1);
  }, [debouncedSearch, filter]);

  const filterDynamicOptions = useMemo(() => {
    const stageOpts = OPPORTUNITY_FILTER_FIELDS.find((f) => f.field === "stage")?.options ?? [];
    const currencyOpts =
      OPPORTUNITY_FILTER_FIELDS.find((f) => f.field === "currency")?.options ?? [];
    return {
      ownerName: ownerOptions,
      stage: stageOpts,
      currency: currencyOpts,
    };
  }, [ownerOptions]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-crm-border bg-white p-1 text-sm">
          <button
            type="button"
            onClick={() => setView("pipeline")}
            className={`rounded-md px-3 py-1 ${
              view === "pipeline" ? "bg-accent-600 text-white" : "text-crm-fg"
            }`}
          >
            Pipeline
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-md px-3 py-1 ${
              view === "list" ? "bg-accent-600 text-white" : "text-crm-fg"
            }`}
          >
            List
          </button>
        </div>
        <AddButton onClick={() => setCreateOpen(true)}>New opportunity</AddButton>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search name, account, owner…"
            className="crm-input pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search opportunities"
          />
        </div>
        <button
          type="button"
          className="crm-btn-secondary shrink-0"
          onClick={() => setShowAdvanced(true)}
        >
          <SlidersHorizontal className="h-4 w-4 text-crm-blue" />
          <span className="hidden sm:inline">Advanced filter</span>
          <span className="sm:hidden">Filter</span>
          {filterActive && (
            <span className="ml-1 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700">
              On
            </span>
          )}
        </button>
      </div>

      <OpportunityAppliedFilterSummary
        filter={filter}
        onClear={() => setFilter(EMPTY_FILTER)}
      />

      {(filterActive || searchActive) && (
        <p className="mb-3 text-xs text-crm-muted">
          Showing opportunities matching your{" "}
          {filterActive && searchActive
            ? "filter and search"
            : filterActive
              ? "filter"
              : "search"}
          .
        </p>
      )}

      {view === "pipeline" ? (
        <OpportunityKanban filterKey={filterKey} filter={filter} search={debouncedSearch.trim()} />
      ) : (
        <OpportunityListTable
          filterKey={filterKey}
          filter={filter}
          search={debouncedSearch.trim()}
          resetToken={listResetToken}
        />
      )}

      <OpportunityAdvancedFilterModal
        open={showAdvanced}
        initial={filter}
        onClose={() => setShowAdvanced(false)}
        onApply={setFilter}
        dynamicOptions={filterDynamicOptions}
      />
      <OpportunityFormDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
