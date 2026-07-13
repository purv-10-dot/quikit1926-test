"use client";

import { useMemo } from "react";
import { Layers, Plus, Search } from "lucide-react";
import type {
  BoardMemberLite,
  GroupedBoardFilters,
  SprintLite,
} from "../_types";
import { GROUP_BY_OPTIONS, type GroupByMode } from "../_lib/field-grouping";
import { FilterSelect, type FilterSelectOption } from "./toolbar/filter-select";
import { FilterMultiSelect } from "./toolbar/filter-multi-select";
import { FilterPanel, FilterRow } from "@/components/filters/filter-panel";
import { CustomFieldFilters } from "@/components/custom-fields/custom-field-filters";
import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { CustomFilter } from "@/lib/customFields/filterQuery";

interface ToolbarProps {
  filters: GroupedBoardFilters;
  onFilterChange: (next: GroupedBoardFilters) => void;
  sprints: SprintLite[];
  members: BoardMemberLite[];
  customFields: CustomFieldDTO[];
  groupBy: GroupByMode;
  onGroupByChange: (mode: GroupByMode) => void;
  onCreateGroup: () => void;
  onCreateTask: () => void;
  /** Gate the "New task" button — false for read-only roles (Viewer). */
  canCreateTask: boolean;
  /** Gate the "New group" button — false for read-only roles (Viewer). */
  canManageGroups: boolean;
}

function parseCustomFilterList(raw: string): CustomFilter[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CustomFilter[]) : [];
  } catch {
    return [];
  }
}

const GROUP_BY_SELECT_OPTIONS: FilterSelectOption[] = GROUP_BY_OPTIONS.map(
  (o) => ({ value: o.value, label: o.label, muted: o.value === "manual" }),
);

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
  customFields,
  groupBy,
  onGroupByChange,
  onCreateGroup,
  onCreateTask,
  canCreateTask,
  canManageGroups,
}: ToolbarProps) {
  function patch(p: Partial<GroupedBoardFilters>) {
    onFilterChange({ ...filters, ...p });
  }

  const customFilterList = parseCustomFilterList(filters.customFilters);
  const memberFilterOptions = members
    .filter((m) => m.user)
    .map((m) => {
      const u = m.user!;
      return {
        id: u.id,
        label: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
      };
    });
  const selectedAssignees = filters.assigneeId
    ? filters.assigneeId.split(",").filter(Boolean)
    : [];
  const activeCount =
    (filters.sprintId !== "all" ? 1 : 0) +
    (filters.assigneeId ? 1 : 0) +
    (filters.priority ? 1 : 0) +
    (filters.type ? 1 : 0) +
    customFilterList.length;

  const assigneeOptions = useMemo<FilterSelectOption[]>(() => {
    const base: FilterSelectOption[] = [
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
      {canCreateTask && (
        <button
          type="button"
          onClick={onCreateTask}
          className="inline-flex items-center gap-1 h-8 px-2.5 sm:px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm shrink-0 transition"
          title="Create a task — defaults to Ungrouped"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New task</span>
        </button>
      )}

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

      <FilterPanel
        activeCount={activeCount}
        onClearAll={() =>
          onFilterChange({
            ...filters,
            sprintId: "all",
            assigneeId: "",
            priority: "",
            type: "",
            customFilters: "",
          })
        }
      >
        <div className="text-xs">
          <span className="mb-1 block font-medium text-gray-600">Sprint</span>
          <FilterSelect
            value={filters.sprintId}
            onChange={(v) => patch({ sprintId: v })}
            options={sprintOptions}
            placeholder="All sprints"
            expand
            width={240}
          />
        </div>
        <div className="text-xs">
          <span className="mb-1 block font-medium text-gray-600">Assignee</span>
          <FilterMultiSelect
            values={selectedAssignees}
            onChange={(vals) => patch({ assigneeId: vals.join(",") })}
            options={assigneeOptions}
            placeholder="Any"
            summaryNoun="people"
            searchable
            expand
            width={240}
          />
        </div>
        <FilterRow
          label="Priority"
          value={filters.priority}
          onChange={(v) => patch({ priority: v })}
          options={PRIORITY_OPTIONS}
        />
        <FilterRow
          label="Type"
          value={filters.type}
          onChange={(v) => patch({ type: v })}
          options={TYPE_OPTIONS}
        />
        <CustomFieldFilters
          className="contents"
          fields={customFields}
          value={customFilterList}
          onChange={(next) =>
            patch({ customFilters: next.length ? JSON.stringify(next) : "" })
          }
          members={memberFilterOptions}
        />
      </FilterPanel>

      <div className="grow" />

      <div
        className="inline-flex items-center gap-1.5 shrink-0"
        title="Choose how tasks are grouped — your custom groups or automatically by a field"
      >
        <Layers className="h-3.5 w-3.5 text-gray-400" aria-hidden />
        <span className="hidden sm:inline text-xs font-medium text-gray-500">
          Group by
        </span>
        <FilterSelect
          value={groupBy}
          onChange={(v) => onGroupByChange(v as GroupByMode)}
          options={GROUP_BY_SELECT_OPTIONS}
          placeholder="Custom groups"
          width={180}
          align="right"
        />
      </div>

      {groupBy === "manual" && canManageGroups && (
        <button
          type="button"
          onClick={onCreateGroup}
          className="inline-flex items-center gap-1 h-8 px-2.5 sm:px-3 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm shrink-0 transition"
          title="Create a new group"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New group</span>
        </button>
      )}
    </div>
  );
}
