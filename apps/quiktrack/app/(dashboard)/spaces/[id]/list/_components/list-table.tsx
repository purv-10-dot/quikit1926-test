"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, EyeOff, GripVertical } from "lucide-react";
import { Skeleton, SkeletonAvatar, SkeletonBadge } from "@/components/skeleton";
import type { ColumnDef, IssuePatch } from "./list-columns";
import type { IssueStatus, ListIssue, SortKey, UserLite } from "./list-types";

const SKELETON_ROW_COUNT = 8;

/** Picks a plausible-looking skeleton shape for each column key. */
function SkeletonForColumn({ colKey }: { colKey: string }) {
  if (colKey === "assigneeId" || colKey === "reporterId") {
    return (
      <span className="flex items-center gap-2">
        <SkeletonAvatar />
        <Skeleton className="h-3 w-20" />
      </span>
    );
  }
  if (colKey === "statusId") return <SkeletonBadge />;
  if (colKey === "title") return <Skeleton className="h-3 w-full max-w-[260px]" />;
  if (colKey === "key") return <Skeleton className="h-3 w-14" />;
  if (colKey === "priority" || colKey === "type" || colKey === "resolution") {
    return <Skeleton className="h-3 w-16" />;
  }
  if (colKey === "storyPoints" || colKey === "eta") {
    return <Skeleton className="h-3 w-8" />;
  }
  return <Skeleton className="h-3 w-20" />;
}

interface Props {
  projectId: string;
  columns: ColumnDef[];
  issues: ListIssue[];
  loading: boolean;
  sort: SortKey | "";
  order: "asc" | "desc";
  onSortChange: (key: SortKey) => void;
  selected: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  getColWidth: (col: string) => number;
  onResizeStart: (col: string, clientX: number) => void;
  onHideColumn: (col: string) => void;
  onReorderColumns: (next: string[]) => void;
  onOpenIssue: (issueId: string) => void;
  statuses: IssueStatus[];
  members: { userId: string; user: UserLite | null }[];
  onPatchIssue: (issueId: string, patch: IssuePatch) => void;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 text-gray-300" />;
  return order === "asc" ? (
    <ArrowUp className="h-3 w-3 text-gray-600" />
  ) : (
    <ArrowDown className="h-3 w-3 text-gray-600" />
  );
}

export function ListTable({
  projectId,
  columns,
  issues,
  loading,
  sort,
  order,
  onSortChange,
  selected,
  onSelectionChange,
  getColWidth,
  onResizeStart,
  onHideColumn,
  onReorderColumns,
  onOpenIssue,
  statuses,
  members,
  onPatchIssue,
}: Props) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const allSelected = issues.length > 0 && issues.every((i) => selected.has(i.id));
  const someSelected = !allSelected && issues.some((i) => selected.has(i.id));

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selected);
      for (const i of issues) next.delete(i.id);
      onSelectionChange(next);
    } else {
      const next = new Set(selected);
      for (const i of issues) next.add(i.id);
      onSelectionChange(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  function handleDrop(targetKey: string) {
    if (!dragKey || dragKey === targetKey) {
      setDragKey(null);
      setDragOverKey(null);
      return;
    }
    const keys = columns.map((c) => c.key);
    const fromIdx = keys.indexOf(dragKey);
    const toIdx = keys.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...keys];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragKey);
    onReorderColumns(next);
    setDragKey(null);
    setDragOverKey(null);
  }

  return (
    <div className="qt-list-scroll flex-1 overflow-x-scroll overflow-y-auto">
      <table className="border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-gray-50 border-b border-gray-200 px-3 py-2 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                aria-label="Select all rows on page"
              />
            </th>
            {columns.map((col) => {
              const isDragOver = dragOverKey === col.key && dragKey !== col.key;
              return (
                <th
                  key={col.key}
                  draggable={!col.required}
                  onDragStart={(e) => {
                    if (col.required) return;
                    setDragKey(col.key);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (!dragKey) return;
                    e.preventDefault();
                    setDragOverKey(col.key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === col.key ? null : k))}
                  onDrop={(e) => { e.preventDefault(); handleDrop(col.key); }}
                  onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
                  className={`group relative bg-gray-50 border-b border-gray-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700 ${isDragOver ? "outline outline-2 outline-blue-400" : ""}`}
                  style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key) }}
                >
                  <div className="flex items-center gap-1.5">
                    {!col.required && (
                      <GripVertical className="h-3 w-3 text-gray-400 opacity-40 group-hover:opacity-100 cursor-grab" />
                    )}
                    {col.sortKey ? (
                      <button
                        type="button"
                        onClick={() => col.sortKey && onSortChange(col.sortKey)}
                        className="flex items-center gap-1.5 hover:text-gray-900"
                      >
                        {col.label}
                        <SortIcon active={sort === col.sortKey} order={order} />
                      </button>
                    ) : (
                      <span>{col.label}</span>
                    )}
                    {!col.required && (
                      <button
                        type="button"
                        onClick={() => onHideColumn(col.key)}
                        title="Hide column"
                        className="ml-auto text-gray-400 hover:text-gray-700 opacity-40 group-hover:opacity-100"
                      >
                        <EyeOff className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div
                    className="absolute right-0 top-1/4 h-1/2 w-px cursor-col-resize bg-gray-300 hover:bg-blue-500 hover:w-1"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onResizeStart(col.key, e.clientX);
                    }}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && issues.length === 0 ? (
            Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
              <tr key={`skel-${i}`} className="border-b border-gray-100">
                <td className="px-3 py-2.5">
                  <Skeleton className="h-3.5 w-3.5 rounded" />
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-3 py-2.5"
                    style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key), maxWidth: getColWidth(col.key) }}
                  >
                    <SkeletonForColumn colKey={col.key} />
                  </td>
                ))}
              </tr>
            ))
          ) : issues.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-8 text-center text-gray-400">
                No work items match your filters.
              </td>
            </tr>
          ) : (
            issues.map((issue) => {
              const isSelected = selected.has(issue.id);
              return (
                <tr
                  key={issue.id}
                  className={`border-b border-gray-100 hover:bg-blue-50/40 ${isSelected ? "bg-blue-50/60" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(issue.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                      aria-label={`Select ${issue.key}`}
                    />
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-3 py-2 align-middle"
                      style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key), maxWidth: getColWidth(col.key) }}
                    >
                      {col.render(issue, { projectId, onOpenIssue, statuses, members, onPatchIssue })}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
