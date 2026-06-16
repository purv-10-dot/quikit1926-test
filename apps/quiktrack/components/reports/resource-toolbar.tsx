"use client";

import { Calendar, CalendarRange, UserCog } from "lucide-react";
import { toDateInput, type Granularity } from "./resource-report-bits";
import { ResourcePeoplePicker } from "./resource-people-picker";
import { FilterDropdown } from "./filter-dropdown";

interface OrgUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function ResourceToolbar({
  granularity,
  onGranularityChange,
  anchorDate,
  onAnchorChange,
  rangeLabel,
  users,
  selectedUserIds,
  onSelectedUserIdsChange,
  roleUserId,
  onRoleUserIdChange,
  roleUserOptions,
}: {
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  anchorDate: Date;
  onAnchorChange: (d: Date) => void;
  rangeLabel: string;
  users: OrgUser[];
  selectedUserIds: string[];
  onSelectedUserIdsChange: (ids: string[]) => void;
  roleUserId: string;
  onRoleUserIdChange: (v: string) => void;
  roleUserOptions: { value: string; label: string }[];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-4 flex-wrap shadow-sm">
      <div className="inline-flex items-center rounded-lg bg-gray-100 p-1 text-sm">
        {(["day", "week", "month"] as Granularity[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onGranularityChange(g)}
            className={`px-4 h-7 rounded-md text-xs font-medium transition-colors ${
              granularity === g
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {g[0].toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <CalendarRange className="h-4 w-4 text-gray-400" />
        <span className="hidden md:inline">{rangeLabel}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={toDateInput(anchorDate)}
            onChange={(e) => {
              const v = e.target.value;
              if (v) onAnchorChange(new Date(`${v}T00:00:00`));
            }}
            className="pl-8 pr-2 h-8 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
        </div>
        <FilterDropdown
          label="PM / Project Admin"
          icon={UserCog}
          value={roleUserId}
          onChange={onRoleUserIdChange}
          options={roleUserOptions}
          searchable
          minWidth={190}
        />
        <ResourcePeoplePicker
          users={users}
          selectedUserIds={selectedUserIds}
          onChange={onSelectedUserIdsChange}
        />
      </div>
    </div>
  );
}
