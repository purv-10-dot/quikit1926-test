"use client";

import { CheckSquare, User } from "lucide-react";
import type { BoardIssue, BoardStatus } from "./board-meta";
import { priorityBadgeClass } from "./board-meta";

/**
 * Subtask card rendered under a parent KanbanTask. Fixed 65 px height (the
 * task-card connector math depends on it). Layout:
 *
 *   [☐] Title …………………………………………………
 *   [Medium]  [TO DO]                          (avatar)
 */
export function SubtaskCard({
  subtask,
  statusesById,
  onOpen,
}: {
  subtask: BoardIssue;
  statusesById: Record<string, BoardStatus>;
  onOpen?: (id: string) => void;
}) {
  const status = statusesById[subtask.statusId];
  const initials = subtask.assigneeId?.slice(0, 1).toUpperCase() ?? "";
  const hasAssignee = !!subtask.assigneeId;
  const priorityLabel = subtask.priority
    ? subtask.priority.charAt(0) + subtask.priority.slice(1).toLowerCase()
    : "";

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(subtask.id);
      }}
      className="bg-white border border-gray-200 rounded-md px-3 py-2 hover:bg-gray-50 hover:shadow-sm transition-all cursor-pointer mt-4 flex flex-col justify-between overflow-hidden"
      style={{ height: "65px" }}
    >
      {/* Title row */}
      <div className="flex items-center gap-2 min-w-0">
        <CheckSquare className="w-4 h-4 flex-shrink-0 text-blue-500" strokeWidth={1.75} />
        <h4 className="text-[13px] font-medium text-gray-900 line-clamp-1 flex-1 min-w-0">
          {subtask.title || "Untitled Subtask"}
        </h4>
      </div>

      {/* Priority + Status + Assignee */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {priorityLabel && (
            <span
              className={`inline-flex items-center px-1.5 h-[18px] rounded text-[10px] font-medium border ${priorityBadgeClass(
                subtask.priority,
              )}`}
            >
              {priorityLabel}
            </span>
          )}
          <span className="inline-flex items-center px-1.5 h-[18px] bg-gray-100 text-gray-700 border border-gray-200 rounded text-[10px] font-medium">
            {status?.name ?? "To Do"}
          </span>
        </div>

        <div
          className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0"
          title={hasAssignee ? initials : "No assignee"}
        >
          {hasAssignee ? initials : <User className="w-3.5 h-3.5 text-white/90" />}
        </div>
      </div>
    </div>
  );
}
