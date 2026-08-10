"use client";

import { RefreshCw } from "lucide-react";
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
}: {
  range: RangeValue;
  preset: RangePreset;
  onRangeChange: (v: RangeValue, preset: RangePreset) => void;
  ownerId: string;
  onOwnerIdChange: (next: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <DateRangePicker value={range} onChange={onRangeChange} preset={preset} />
      <AgentFilter value={ownerId} onChange={onOwnerIdChange} />
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="Refresh dashboard"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-crm-border bg-white text-crm-muted shadow-sm transition hover:bg-crm-panel disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
