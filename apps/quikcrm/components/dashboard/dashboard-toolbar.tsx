"use client";

import { Filter, RefreshCw } from "lucide-react";
import { DateRangePicker, type RangePreset, type RangeValue } from "./date-range-picker";
import { AgentFilter } from "./agent-filter";

export function DashboardToolbar({
  range,
  preset,
  onRangeChange,
  ownerId,
  onOwnerIdChange,
  onRefresh,
  refreshing,
  filtersOpen,
  onToggleFilters,
  activeFilterCount = 0,
}: {
  range: RangeValue;
  preset: RangePreset;
  onRangeChange: (v: RangeValue, preset: RangePreset) => void;
  ownerId: string;
  onOwnerIdChange: (next: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
  activeFilterCount?: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-crm-border bg-white px-4 py-3 shadow-sm">
      {/* Date range presets */}
      <DateRangePicker value={range} onChange={onRangeChange} preset={preset} />

      {/* Divider */}
      <div className="h-5 w-px shrink-0 bg-crm-border" aria-hidden />

      {/* Owner filter */}
      <AgentFilter value={ownerId} onChange={onOwnerIdChange} />

      {/* Refresh */}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh dashboard"
        title="Refresh"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-crm-border bg-white text-crm-muted transition hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 disabled:opacity-40"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      </button>

      {/* Filters toggle */}
      {onToggleFilters ? (
        <button
          type="button"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          aria-controls="overview-global-filters"
          className={[
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition",
            filtersOpen
              ? "border-accent-400 bg-accent-50 text-accent-700"
              : "border-crm-border bg-white text-crm-text hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700",
          ].join(" ")}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Filters
          {activeFilterCount > 0 ? (
            <span className="ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent-600 px-1 text-[9px] font-bold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
