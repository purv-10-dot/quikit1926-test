"use client";

import { memo, MouseEvent } from "react";
import type {
  BoardMemberLite,
  GroupedBoardStatus,
  GroupedBoardTask,
  SprintLite,
} from "../_types";
import { TitleCell } from "./cells/title-cell";
import { StatusCell } from "./cells/status-cell";
import { PriorityCell } from "./cells/priority-cell";
import { AssigneeCell } from "./cells/assignee-cell";
import { DateCell } from "./cells/date-cell";
import { SprintCell } from "./cells/sprint-cell";
import { SortableTask } from "./dnd/sortable-task";

interface TaskRowProps {
  task: GroupedBoardTask;
  projectId: string;
  groupId: string;
  statuses: GroupedBoardStatus[];
  members: BoardMemberLite[];
  sprints: SprintLite[];
  onPatch: (id: string, patch: Partial<GroupedBoardTask>) => void;
  onOpenDetail: (taskId: string) => void;
  onContextMenu: (e: MouseEvent, task: GroupedBoardTask) => void;
  isSelected: boolean;
  onToggleSelected: (taskId: string) => void;
}

/**
 * Single source of truth for the row's column layout. `ColumnLabels` in
 * group-section.tsx uses the same grid template so headers line up.
 * Column math:
 *   grip 32 + task 220 + status 160 + priority 120 + assignee 80
 *     + due 140 + sprint 140 = 892 px minimum.
 */
export const ROW_GRID_TEMPLATE =
  "grid-cols-[32px_minmax(220px,1fr)_160px_120px_80px_140px_140px]";
export const ROW_GRID_MIN_WIDTH = 892;

function TaskRowImpl({
  task,
  projectId,
  groupId,
  statuses,
  members,
  sprints,
  onPatch,
  onOpenDetail,
  onContextMenu,
  isSelected,
  onToggleSelected,
}: TaskRowProps) {
  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, task);
      }}
    >
      <SortableTask taskId={task.id} groupId={groupId}>
        <div
          className={`grid ${ROW_GRID_TEMPLATE} items-stretch px-0 transition-colors [&>*]:self-stretch [&>*]:flex [&>*]:items-center [&>*]:justify-center [&>*:nth-child(2)]:justify-start [&>*]:px-2 [&>*]:py-1.5 [&>*]:border-r [&>*]:border-slate-200 dark:[&>*]:border-slate-700 [&>*:last-child]:border-r-0 ${
            isSelected
              ? "bg-blue-50/60 dark:bg-blue-500/15"
              : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
          }`}
        >
          <span
            className="justify-center"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelected(task.id)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
              aria-label="Select task"
            />
          </span>
          <TitleCell
            taskId={task.id}
            taskKey={task.key}
            value={task.title}
            onCommit={(title) => onPatch(task.id, { title })}
            onOpenDetail={() => onOpenDetail(task.id)}
          />
          <StatusCell
            issueId={task.id}
            projectId={projectId}
            value={task.statusId}
            statuses={statuses}
            onCommit={(statusId) => onPatch(task.id, { statusId })}
          />
          <PriorityCell
            value={task.priority}
            onCommit={(priority) => onPatch(task.id, { priority })}
          />
          <AssigneeCell
            value={task.assigneeId}
            members={members}
            onCommit={(assigneeId) => onPatch(task.id, { assigneeId })}
          />
          <DateCell
            value={task.dueDate}
            onCommit={(dueDate) => onPatch(task.id, { dueDate })}
            placeholder="Due —"
          />
          <SprintCell
            value={task.sprintId}
            sprints={sprints}
            onCommit={(sprintId) => onPatch(task.id, { sprintId })}
          />
        </div>
      </SortableTask>
    </div>
  );
}

export const TaskRow = memo(TaskRowImpl, (a, b) => {
  return (
    a.task.id === b.task.id &&
    a.task.updatedAt === b.task.updatedAt &&
    a.task.orderInGroup === b.task.orderInGroup &&
    a.groupId === b.groupId &&
    a.statuses === b.statuses &&
    a.members === b.members &&
    a.sprints === b.sprints &&
    a.isSelected === b.isSelected
  );
});
