"use client";

import { EyeOff, GripVertical } from "lucide-react";
import type { ColumnDef } from "../../../spaces/[id]/list/_components/list-columns";
import { PROJECT_COL } from "./filter-table-cells";

interface Props {
  columns: ColumnDef[];
  allSelected: boolean;
  onToggleAll: () => void;
  getColWidth: (col: string) => number;
  onResizeStart: (col: string, clientX: number) => void;
  onHideColumn: (col: string) => void;
  dragKey: string | null;
  dragOverKey: string | null;
  onDragKeyChange: (key: string | null) => void;
  onDragOverKeyChange: (key: string | null) => void;
  onDrop: (targetKey: string) => void;
}

/** Header row for the editable filter table: select-all, drag-reorder, hide, resize. */
export function FilterTableHeader({
  columns,
  allSelected,
  onToggleAll,
  getColWidth,
  onResizeStart,
  onHideColumn,
  dragKey,
  dragOverKey,
  onDragKeyChange,
  onDragOverKeyChange,
  onDrop,
}: Props) {
  return (
    <thead className="sticky top-0 z-10">
      <tr>
        <th className="w-10 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
            aria-label="Select all rows on page"
          />
        </th>
        {columns.map((col) => {
          const isSynthetic = col.key === PROJECT_COL.key;
          const isDragOver = dragOverKey === col.key && dragKey !== col.key;
          const draggable = !col.required && !isSynthetic;
          return (
            <th
              key={col.key}
              draggable={draggable}
              onDragStart={(e) => {
                if (!draggable) return;
                onDragKeyChange(col.key);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragKey || isSynthetic) return;
                e.preventDefault();
                onDragOverKeyChange(col.key);
              }}
              onDragLeave={() => onDragOverKeyChange(dragOverKey === col.key ? null : dragOverKey)}
              onDrop={(e) => {
                e.preventDefault();
                if (!isSynthetic) onDrop(col.key);
              }}
              onDragEnd={() => {
                onDragKeyChange(null);
                onDragOverKeyChange(null);
              }}
              className={`group relative border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 ${isDragOver ? "outline outline-2 outline-blue-400" : ""}`}
              style={{ width: getColWidth(col.key), minWidth: getColWidth(col.key) }}
            >
              <div className="flex items-center gap-1.5">
                {draggable && (
                  <GripVertical className="h-3 w-3 cursor-grab text-gray-400 opacity-40 group-hover:opacity-100" />
                )}
                <span>{col.label}</span>
                {!col.required && !isSynthetic && (
                  <button
                    type="button"
                    onClick={() => onHideColumn(col.key)}
                    title="Hide column"
                    className="ml-auto text-gray-400 opacity-40 hover:text-gray-700 group-hover:opacity-100"
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div
                className="absolute right-0 top-1/4 h-1/2 w-px cursor-col-resize bg-gray-300 hover:w-1 hover:bg-blue-500"
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
  );
}
