"use client";

import {
  Briefcase,
  Calendar as CalendarIcon,
  CircleDot,
  Filter,
  User as UserIcon,
} from "lucide-react";
import { FilterDropdown } from "./filter-dropdown";

interface Option {
  value: string;
  label: string;
}

export function ProjectReportToolbar({
  projectId,
  onProjectIdChange,
  projectOptions,
  startDate,
  onStartDateChange,
  statusName,
  onStatusNameChange,
  statusOptions,
  assigneeId,
  onAssigneeIdChange,
  assigneeOptions,
  onClear,
  filtersActive,
}: {
  projectId: string;
  onProjectIdChange: (v: string) => void;
  projectOptions: Option[];
  startDate: string;
  onStartDateChange: (v: string) => void;
  statusName: string;
  onStatusNameChange: (v: string) => void;
  statusOptions: Option[];
  assigneeId: string;
  onAssigneeIdChange: (v: string) => void;
  assigneeOptions: Option[];
  onClear: () => void;
  filtersActive: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 flex flex-wrap items-center gap-2 shadow-sm">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 pr-1">
        <Filter className="h-3.5 w-3.5" />
        Filters
      </div>
      <FilterDropdown
        label="Project Name"
        icon={Briefcase}
        value={projectId}
        onChange={onProjectIdChange}
        options={projectOptions}
      />
      <div className="relative">
        <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="h-9 pl-8 pr-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 min-w-[150px]"
          aria-label="Start Date"
        />
      </div>
      <FilterDropdown
        label="Status"
        icon={CircleDot}
        value={statusName}
        onChange={onStatusNameChange}
        options={statusOptions}
      />
      <FilterDropdown
        label="Assignee"
        icon={UserIcon}
        value={assigneeId}
        onChange={onAssigneeIdChange}
        options={assigneeOptions}
      />
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
