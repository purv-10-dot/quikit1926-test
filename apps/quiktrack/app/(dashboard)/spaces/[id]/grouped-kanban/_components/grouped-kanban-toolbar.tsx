"use client";

import { CalendarRange, Plus, Search } from "lucide-react";
import type {
  BoardMemberLite,
  GroupedBoardFilters,
  SprintLite,
} from "../_types";

interface ToolbarProps {
  filters: GroupedBoardFilters;
  onFilterChange: (next: GroupedBoardFilters) => void;
  activeSprint: SprintLite | null;
  members: BoardMemberLite[];
  onCreateGroup: () => void;
  onCreateTask: () => void;
}

export function GroupedKanbanToolbar({
  filters,
  onFilterChange,
  activeSprint,
  members,
  onCreateGroup,
  onCreateTask,
}: ToolbarProps) {
  function patch(p: Partial<GroupedBoardFilters>) {
    onFilterChange({ ...filters, ...p });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <button
        type="button"
        onClick={onCreateTask}
        className="inline-flex items-center gap-1 h-8 px-2.5 sm:px-3 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 shrink-0"
        title="Create a task — defaults to Ungrouped"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">New task</span>
      </button>

      <div className="relative flex-1 min-w-0 sm:flex-initial">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value })}
          placeholder="Search"
          className="h-8 w-full sm:w-64 pl-8 pr-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <span
        className={`inline-flex items-center gap-1 h-8 px-2.5 text-xs rounded border max-w-[160px] sm:max-w-none shrink-0 ${
          activeSprint
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
        title={
          activeSprint
            ? `Showing tasks from the active sprint: ${activeSprint.name}`
            : "No active sprint — tasks won't appear until a sprint is started"
        }
      >
        <CalendarRange className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium truncate">
          {activeSprint ? activeSprint.name : "No active sprint"}
        </span>
      </span>

      <select
        value={filters.assigneeId}
        onChange={(e) => patch({ assigneeId: e.target.value })}
        className="h-8 px-2 text-xs border border-gray-300 rounded bg-white"
      >
        <option value="">Any assignee</option>
        <option value="null">Unassigned</option>
        {members
          .filter((m) => m.user)
          .map((m) => (
            <option key={m.user!.id} value={m.user!.id}>
              {[m.user!.firstName, m.user!.lastName].filter(Boolean).join(" ").trim() ||
                m.user!.email}
            </option>
          ))}
      </select>

      <select
        value={filters.priority}
        onChange={(e) => patch({ priority: e.target.value })}
        className="h-8 px-2 text-xs border border-gray-300 rounded bg-white"
      >
        <option value="">Any priority</option>
        <option value="HIGHEST">Highest</option>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
        <option value="LOWEST">Lowest</option>
      </select>

      <select
        value={filters.type}
        onChange={(e) => patch({ type: e.target.value })}
        className="h-8 px-2 text-xs border border-gray-300 rounded bg-white"
      >
        <option value="">Any type</option>
        <option value="TASK">Task</option>
        <option value="BUG">Bug</option>
        <option value="STORY">Story</option>
      </select>

      <div className="grow" />

      <button
        type="button"
        onClick={onCreateGroup}
        className="inline-flex items-center gap-1 h-8 px-2.5 sm:px-3 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 shrink-0"
        title="Create a new group"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">New group</span>
      </button>
    </div>
  );
}
