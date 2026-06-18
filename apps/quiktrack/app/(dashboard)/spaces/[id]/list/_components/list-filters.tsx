"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { TYPE_META, PRIORITY_META, type ListFilters, type IssueType, type Priority, type IssueStatus, type UserLite, userLabel } from "./list-types";
import { BoardFilterSelect } from "../../board/_components/board-filter-select";
import { BoardFilterMultiSelect } from "../../board/_components/board-filter-multi-select";

interface Props {
  filters: ListFilters;
  onChange: (next: ListFilters) => void;
  statuses: IssueStatus[];
  members: { userId: string; user: UserLite | null }[];
}

const ALL_TYPES: IssueType[] = ["TASK", "BUG", "STORY", "EPIC", "SUBTASK"];
const ALL_PRIORITIES: Priority[] = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"];

function activeCount(f: ListFilters): number {
  return (f.statusId ? 1 : 0) + (f.type ? 1 : 0) + (f.priority ? 1 : 0) + (f.assigneeId ? 1 : 0);
}

export function ListFilterButton({ filters, onChange, statuses, members }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return;
      const t = e.target as HTMLElement;
      // BoardFilterSelect portals its option menu to document.body — a click
      // there is outside `ref` but should not close this popover, otherwise the
      // option unmounts before its onChange fires and the filter never applies.
      if (t.closest?.("[data-portal-popover]")) return;
      if (ref.current && !ref.current.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const count = activeCount(filters);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        <Filter className="h-4 w-4" />
        Filter
        {count > 0 && (
          <span className="ml-1 rounded-full bg-accent-600 px-1.5 text-[10px] font-medium text-white">{count}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <BoardFilterSelect
            label="Type"
            value={filters.type}
            onChange={(v) => onChange({ ...filters, type: v })}
            options={[
              { value: "", label: "Any" },
              ...ALL_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label })),
            ]}
          />
          <BoardFilterSelect
            label="Status"
            value={filters.statusId}
            onChange={(v) => onChange({ ...filters, statusId: v })}
            options={[
              { value: "", label: "Any" },
              ...statuses.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <BoardFilterSelect
            label="Priority"
            value={filters.priority}
            onChange={(v) => onChange({ ...filters, priority: v })}
            options={[
              { value: "", label: "Any" },
              ...ALL_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label })),
            ]}
          />
          <BoardFilterMultiSelect
            label="Assignee"
            value={filters.assigneeId}
            onChange={(v) => onChange({ ...filters, assigneeId: v })}
            summaryNoun="people"
            searchable
            options={[
              { value: "null", label: "Unassigned" },
              ...members
                .filter((m): m is typeof m & { user: UserLite } => Boolean(m.user))
                .map((m) => ({ value: m.user.id, label: userLabel(m.user) })),
            ]}
          />
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, statusId: "", type: "", priority: "", assigneeId: "" })}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

