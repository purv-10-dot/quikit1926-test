"use client";

import { useMemo } from "react";
import { Plus, Search } from "lucide-react";
import type {
  BoardMemberLite,
  GroupedBoardFilters,
  SprintLite,
} from "../_types";
import { FilterSelect, type FilterSelectOption } from "./toolbar/filter-select";

interface ToolbarProps {
  filters: GroupedBoardFilters;
  onFilterChange: (next: GroupedBoardFilters) => void;
  sprints: SprintLite[];
  members: BoardMemberLite[];
  onCreateGroup: () => void;
  onCreateTask: () => void;
}

/** Dot color for a sprint based on its status. Only ACTIVE sprints surface
 *  in the dropdown today, but the switch keeps room for future variants. */
function sprintDot(status: string): string | undefined {
  switch (status) {
    case "ACTIVE":
      return "#10b981"; // emerald — live sprint
    default:
      return undefined;
  }
}

const PRIORITY_OPTIONS: FilterSelectOption[] = [
  { value: "", label: "Any priority", muted: true },
  { value: "HIGHEST", label: "Highest", dot: "#dc2626" },
  { value: "HIGH", label: "High", dot: "#ea580c" },
  { value: "MEDIUM", label: "Medium", dot: "#d97706" },
  { value: "LOW", label: "Low", dot: "#0284c7" },
  { value: "LOWEST", label: "Lowest", dot: "#2563eb" },
];

const TYPE_OPTIONS: FilterSelectOption[] = [
  { value: "", label: "Any type", muted: true },
  { value: "TASK", label: "Task", dot: "#3b82f6" },
  { value: "BUG", label: "Bug", dot: "#ef4444" },
  { value: "STORY", label: "Story", dot: "#10b981" },
];

function memberDotColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}

export function GroupedKanbanToolbar({
  filters,
  onFilterChange,
  sprints,
  members,
  onCreateGroup,
  onCreateTask,
}: ToolbarProps) {
  function patch(p: Partial<GroupedBoardFilters>) {
    onFilterChange({ ...filters, ...p });
  }

  const assigneeOptions = useMemo<FilterSelectOption[]>(() => {
    const base: FilterSelectOption[] = [
      { value: "", label: "Any assignee", muted: true },
      { value: "null", label: "Unassigned", muted: true },
    ];
    const memberOpts = members
      .filter((m) => m.user)
      .map((m) => {
        const u = m.user!;
        const label =
          [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
        return { value: u.id, label, dot: memberDotColor(u.id) };
      });
    return [...base, ...memberOpts];
  }, [members]);

  // Sprint dropdown — Grouped Kanban only shows ACTIVE sprints (backlog /
  // planned / completed never appear). Multiple actives are possible, so
  // "All active sprints" unions them. Selecting a specific row narrows to
  // that one sprint.
  const sprintOptions = useMemo<FilterSelectOption[]>(() => {
    const activeSprints = sprints
      .filter((s) => s.status === "ACTIVE")
      .sort((a, b) => a.name.localeCompare(b.name));
    return [
      { value: "all", label: "All active sprints", muted: true },
      ...activeSprints.map((s) => ({
        value: s.id,
        label: s.name,
        dot: sprintDot(s.status),
      })),
    ];
  }, [sprints]);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <button
        type="button"
        onClick={onCreateTask}
        className="inline-flex items-center gap-1 h-8 px-2.5 sm:px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm shrink-0 transition"
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
          className="h-8 w-full sm:w-64 pl-8 pr-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
        />
      </div>

      <FilterSelect
        value={filters.sprintId}
        onChange={(v) => patch({ sprintId: v })}
        options={sprintOptions}
        placeholder="Sprint"
        width={240}
      />

      <FilterSelect
        value={filters.assigneeId}
        onChange={(v) => patch({ assigneeId: v })}
        options={assigneeOptions}
        placeholder="Any assignee"
        width={220}
      />

      <FilterSelect
        value={filters.priority}
        onChange={(v) => patch({ priority: v })}
        options={PRIORITY_OPTIONS}
        placeholder="Any priority"
        width={180}
      />

      <FilterSelect
        value={filters.type}
        onChange={(v) => patch({ type: v })}
        options={TYPE_OPTIONS}
        placeholder="Any type"
        width={160}
      />

      <div className="grow" />

      <button
        type="button"
        onClick={onCreateGroup}
        className="inline-flex items-center gap-1 h-8 px-2.5 sm:px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm shrink-0 transition"
        title="Create a new group"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">New group</span>
      </button>
    </div>
  );
}
