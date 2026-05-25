"use client";

import { ReactNode, useState } from "react";
import { TASK_DRAG_MIME } from "./sortable-task";

export const GROUP_DRAG_MIME = "text/qt-group-id";

interface SortableGroupProps {
  groupId: string;
  color?: string;
  dragHandle?: (handleProps: {
    onDragStart: (e: React.DragEvent) => void;
    draggable: boolean;
  }) => ReactNode;
  onTaskDropped: (taskId: string) => void;
  onGroupDropped: (sourceGroupId: string) => void;
  body: ReactNode;
}

export function SortableGroup({
  groupId,
  color,
  dragHandle,
  onTaskDropped,
  onGroupDropped,
  body,
}: SortableGroupProps) {
  const [isOver, setIsOver] = useState(false);
  const validColor =
    color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#94a3b8";

  function handleDragOver(e: React.DragEvent) {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes(TASK_DRAG_MIME) || types.includes(GROUP_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsOver(true);
    }
  }
  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsOver(false);
    }
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(false);
    const taskId = e.dataTransfer.getData(TASK_DRAG_MIME);
    if (taskId) {
      onTaskDropped(taskId);
      return;
    }
    const sourceGroupId = e.dataTransfer.getData(GROUP_DRAG_MIME);
    if (sourceGroupId && sourceGroupId !== groupId) {
      onGroupDropped(sourceGroupId);
    }
  }

  return (
    <section
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ borderLeftColor: validColor, borderLeftWidth: 4 }}
      className={`bg-white border border-l-0 rounded-md shadow-sm transition-colors ${
        isOver ? "border-blue-400 ring-2 ring-blue-200" : "border-gray-200"
      }`}
    >
      {dragHandle?.({
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData(GROUP_DRAG_MIME, groupId);
          e.dataTransfer.effectAllowed = "move";
        },
      })}
      <div className={`min-h-[40px] overflow-x-auto ${isOver ? "bg-blue-50/40" : ""}`}>
        {body}
      </div>
    </section>
  );
}
