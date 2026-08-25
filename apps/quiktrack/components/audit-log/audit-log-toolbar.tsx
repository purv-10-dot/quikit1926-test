"use client";

import { Calendar as CalendarIcon, Filter, Wrench, Box, Zap } from "lucide-react";
import { FilterDropdown } from "@/components/reports/filter-dropdown";

interface Option {
  value: string;
  label: string;
}

export function AuditLogToolbar({
  tool,
  onToolChange,
  toolOptions,
  entityType,
  onEntityTypeChange,
  entityTypeOptions,
  action,
  onActionChange,
  actionOptions,
  from,
  onFromChange,
  to,
  onToChange,
  onClear,
  filtersActive,
}: {
  tool: string;
  onToolChange: (v: string) => void;
  toolOptions: Option[];
  entityType: string;
  onEntityTypeChange: (v: string) => void;
  entityTypeOptions: Option[];
  action: string;
  onActionChange: (v: string) => void;
  actionOptions: Option[];
  from: string;
  onFromChange: (v: string) => void;
  to: string;
  onToChange: (v: string) => void;
  onClear: () => void;
  filtersActive: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 flex flex-wrap items-center gap-2 shadow-sm">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 pr-1">
        <Filter className="h-3.5 w-3.5" />
        Filters
      </div>
      <FilterDropdown label="Tool" icon={Wrench} value={tool} onChange={onToolChange} options={toolOptions} searchable />
      <FilterDropdown label="Entity" icon={Box} value={entityType} onChange={onEntityTypeChange} options={entityTypeOptions} />
      <FilterDropdown label="Action" icon={Zap} value={action} onChange={onActionChange} options={actionOptions} />
      <div className="relative">
        <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-9 pl-8 pr-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 min-w-[150px]"
          aria-label="From date"
        />
      </div>
      <div className="relative">
        <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="h-9 pl-8 pr-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 min-w-[150px]"
          aria-label="To date"
        />
      </div>
      {filtersActive && (
        <button
          type="button"
          onClick={onClear}
          className="h-9 px-3 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors ml-auto"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
