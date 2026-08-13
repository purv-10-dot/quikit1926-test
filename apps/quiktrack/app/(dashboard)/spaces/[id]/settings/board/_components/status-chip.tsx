"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AlertTriangle, GripVertical } from "lucide-react";
import type { BoardStatus } from "./board-columns-types";

/** A draggable status card (shows name, open-issue count, and an unmapped ⚠). */
export function StatusChip({
  status,
  count,
  warn,
}: {
  status: BoardStatus;
  count: number;
  warn: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: status.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab items-start gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-2 text-sm shadow-sm ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-300" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${status.color}22`, color: status.color }}
          >
            {status.name}
          </span>
          {warn && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
        </div>
        <div className="mt-0.5 text-[11px] text-gray-400">{count} work item{count === 1 ? "" : "s"}</div>
      </div>
    </div>
  );
}

/** A droppable region (a column body or the Unmapped bucket). */
export function DropZone({
  id,
  children,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? "ring-2 ring-accent-300" : ""}`}>
      {children}
    </div>
  );
}
