"use client";

import {
  TYPE_META,
  PRIORITY_META,
  type ListFilters,
  type IssueType,
  type Priority,
  type IssueStatus,
  type UserLite,
  userLabel,
} from "./list-types";
import { FilterMultiSelect } from "../../grouped-kanban/_components/toolbar/filter-multi-select";
import { FilterPanel, FilterRow } from "@/components/filters/filter-panel";
import { CustomFieldFilters } from "@/components/custom-fields/custom-field-filters";
import type { CustomFieldDTO } from "@/lib/services/customFields";

interface Props {
  filters: ListFilters;
  onChange: (next: ListFilters) => void;
  statuses: IssueStatus[];
  members: { userId: string; user: UserLite | null }[];
  customFields: CustomFieldDTO[];
}

const ALL_TYPES: IssueType[] = ["TASK", "BUG", "STORY", "EPIC", "SUBTASK"];
const ALL_PRIORITIES: Priority[] = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"];

function activeCount(f: ListFilters): number {
  return (
    (f.statusId ? 1 : 0) +
    (f.type ? 1 : 0) +
    (f.priority ? 1 : 0) +
    (f.assigneeId ? 1 : 0) +
    f.customFilters.length
  );
}

export function ListFilterButton({ filters, onChange, statuses, members, customFields }: Props) {
  const selectedAssignees = filters.assigneeId
    ? filters.assigneeId.split(",").filter(Boolean)
    : [];
  const memberOpts = members
    .filter((m): m is typeof m & { user: UserLite } => Boolean(m.user))
    .map((m) => ({ id: m.user.id, label: userLabel(m.user) }));

  return (
    <FilterPanel
      activeCount={activeCount(filters)}
      onClearAll={() =>
        onChange({ ...filters, statusId: "", type: "", priority: "", assigneeId: "", customFilters: [] })
      }
    >
      <FilterRow
        label="Type"
        value={filters.type}
        onChange={(v) => onChange({ ...filters, type: v })}
        options={[
          { value: "", label: "Any", muted: true },
          ...ALL_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label })),
        ]}
      />
      <FilterRow
        label="Status"
        value={filters.statusId}
        onChange={(v) => onChange({ ...filters, statusId: v })}
        options={[
          { value: "", label: "Any", muted: true },
          ...statuses.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
      <FilterRow
        label="Priority"
        value={filters.priority}
        onChange={(v) => onChange({ ...filters, priority: v })}
        options={[
          { value: "", label: "Any", muted: true },
          ...ALL_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label })),
        ]}
      />
      <div className="text-xs">
        <span className="mb-1 block font-medium text-gray-600">Assignee</span>
        <FilterMultiSelect
          values={selectedAssignees}
          onChange={(vals) => onChange({ ...filters, assigneeId: vals.join(",") })}
          placeholder="Any"
          summaryNoun="people"
          searchable
          expand
          width={240}
          options={[
            { value: "null", label: "Unassigned", muted: true },
            ...memberOpts.map((m) => ({ value: m.id, label: m.label })),
          ]}
        />
      </div>
      <CustomFieldFilters
        className="contents"
        fields={customFields}
        value={filters.customFilters}
        onChange={(next) => onChange({ ...filters, customFilters: next })}
        members={memberOpts}
      />
    </FilterPanel>
  );
}
