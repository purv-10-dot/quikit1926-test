"use client";

import { ReactNode, useState } from "react";

interface SortableTaskProps {
  taskId: string;
  groupId: string;
  children: ReactNode;
}

export const TASK_DRAG_MIME = "text/qt-task-id";

export function SortableTask({ taskId, children }: SortableTaskProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TASK_DRAG_MIME, taskId);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={`border-b border-gray-100 last:border-b-0 cursor-grab active:cursor-grabbing select-none transition-opacity ${
        dragging ? "opacity-40" : "hover:bg-blue-50/40"
      }`}
    >
      {children}
    </div>
  );
}
