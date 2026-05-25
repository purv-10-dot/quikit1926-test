"use client";

import { MouseEvent } from "react";
import { Plus } from "lucide-react";
import type {
  BoardMemberLite,
  GroupedBoardGroup,
  GroupedBoardStatus,
  GroupedBoardTask,
  SprintLite,
} from "../_types";
import { SortableGroup } from "./dnd/sortable-group";
import { GroupHeader } from "./group-header";
import { ROW_GRID_MIN_WIDTH, ROW_GRID_TEMPLATE, TaskRow } from "./task-row";

interface GroupSectionProps {
  group: GroupedBoardGroup;
  statuses: GroupedBoardStatus[];
  members: BoardMemberLite[];
  sprints: SprintLite[];
  onPatchTask: (id: string, patch: Partial<GroupedBoardTask>) => void;
  onRenameGroup: (id: string, name: string) => void;
  onRecolorGroup: (id: string, color: string) => void;
  onToggleCollapse: (id: string, collapsed: boolean) => void;
  onDeleteGroup: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  onTaskContextMenu: (e: MouseEvent, task: GroupedBoardTask) => void;
  onAddTask: () => void;
  selectedTaskIds: Set<string>;
  onToggleTaskSelected: (taskId: string) => void;
  onToggleGroupSelected: (taskIds: string[], select: boolean) => void;
  onTaskDropped: (taskId: string) => void;
  onGroupDropped: (sourceGroupId: string) => void;
}

export function GroupSection({
  group,
  statuses,
  members,
  sprints,
  onPatchTask,
  onRenameGroup,
  onRecolorGroup,
  onToggleCollapse,
  onDeleteGroup,
  onOpenTask,
  onTaskContextMenu,
  onAddTask,
  selectedTaskIds,
  onToggleTaskSelected,
  onToggleGroupSelected,
  onTaskDropped,
  onGroupDropped,
}: GroupSectionProps) {
  const groupTaskIds = group.tasks.map((t) => t.id);
  const allSelected =
    groupTaskIds.length > 0 && groupTaskIds.every((id) => selectedTaskIds.has(id));
  const someSelected =
    !allSelected && groupTaskIds.some((id) => selectedTaskIds.has(id));

  return (
    <div className="space-y-1.5">
      <GroupHeader
        group={group}
        taskCount={group.taskCount}
        onToggleCollapse={() => onToggleCollapse(group.id, !group.isCollapsed)}
        onRename={(name) => onRenameGroup(group.id, name)}
        onRecolor={(color) => onRecolorGroup(group.id, color)}
        onDelete={group.isDefault ? undefined : () => onDeleteGroup(group.id)}
      />

      <SortableGroup
        groupId={group.id}
        color={group.color}
        onTaskDropped={onTaskDropped}
        onGroupDropped={onGroupDropped}
        body={
          group.isCollapsed ? (
            <CollapsedSummary group={group} statuses={statuses} />
          ) : group.tasks.length === 0 ? (
            <div style={{ minWidth: ROW_GRID_MIN_WIDTH }}>
              <ColumnLabels
                allSelected={allSelected}
                indeterminate={someSelected}
                onToggleAll={() => onToggleGroupSelected(groupTaskIds, !allSelected)}
              />
              <div className="px-3 py-6 text-center text-xs text-gray-400 border-2 border-dashed border-gray-200 m-2 rounded">
                Drop a task here to add it to this group.
              </div>
              <AddTaskRow onAddTask={onAddTask} />
            </div>
          ) : (
            <div style={{ minWidth: ROW_GRID_MIN_WIDTH }} className="divide-y divide-slate-100">
              <ColumnLabels
                allSelected={allSelected}
                indeterminate={someSelected}
                onToggleAll={() => onToggleGroupSelected(groupTaskIds, !allSelected)}
              />
              {group.tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  groupId={group.id}
                  statuses={statuses}
                  members={members}
                  sprints={sprints}
                  onPatch={onPatchTask}
                  onOpenDetail={onOpenTask}
                  onContextMenu={onTaskContextMenu}
                  isSelected={selectedTaskIds.has(t.id)}
                  onToggleSelected={onToggleTaskSelected}
                />
              ))}
              <AddTaskRow onAddTask={onAddTask} />
            </div>
          )
        }
      />
    </div>
  );
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
      aria-label="Select all tasks in this group"
    />
  );
}

function ColumnLabels({
  allSelected,
  indeterminate,
  onToggleAll,
}: {
  allSelected: boolean;
  indeterminate: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div
      className={`grid ${ROW_GRID_TEMPLATE} items-stretch px-0 text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-200 border-b border-slate-300 [&>*]:self-stretch [&>*]:flex [&>*]:items-center [&>*]:justify-center [&>*]:px-2 [&>*]:py-2.5 [&>*]:border-r [&>*]:border-slate-300 [&>*:last-child]:border-r-0`}
    >
      <span>
        <IndeterminateCheckbox
          checked={allSelected}
          indeterminate={indeterminate}
          onChange={onToggleAll}
        />
      </span>
      <span className="truncate">Task</span>
      <span className="truncate">Status</span>
      <span className="truncate">Priority</span>
      <span className="truncate">Assignee</span>
      <span className="truncate">Due</span>
      <span className="truncate">Sprint</span>
    </div>
  );
}

function AddTaskRow({ onAddTask }: { onAddTask: () => void }) {
  return (
    <button
      type="button"
      onClick={onAddTask}
      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-blue-700 bg-slate-50 hover:bg-blue-50 border-t border-slate-200 transition-colors group"
    >
      <span className="h-5 w-5 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
        <Plus className="h-3.5 w-3.5" />
      </span>
      <span>Add task</span>
    </button>
  );
}

function CollapsedSummary({
  group,
  statuses,
}: {
  group: GroupedBoardGroup;
  statuses: GroupedBoardStatus[];
}) {
  const total = group.tasks.length;
  const categoryById = new Map(statuses.map((s) => [s.id, s.category]));
  let done = 0;
  let inProgress = 0;
  let other = 0;
  for (const t of group.tasks) {
    const cat = categoryById.get(t.statusId);
    if (cat === "DONE") done += 1;
    else if (cat === "IN_PROGRESS") inProgress += 1;
    else other += 1;
  }
  const assigneeCount = new Set(
    group.tasks.map((t) => t.assigneeId).filter((id): id is string => !!id),
  ).size;
  const nextDue = group.tasks
    .map((t) => t.dueDate)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return (
    <div
      style={{ minWidth: ROW_GRID_MIN_WIDTH }}
      className={`grid ${ROW_GRID_TEMPLATE} items-stretch text-[11px] text-slate-600 bg-slate-50 [&>*]:self-stretch [&>*]:flex [&>*]:items-center [&>*]:px-2 [&>*]:py-2 [&>*]:border-r [&>*]:border-slate-200 [&>*:last-child]:border-r-0`}
    >
      <span />
      <span className="font-medium text-slate-700">
        {total} {total === 1 ? "task" : "tasks"}
      </span>
      <span>
        {total === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span className="flex h-2 w-full max-w-[120px] rounded overflow-hidden bg-slate-200">
            {done > 0 && (
              <span
                className="bg-green-500"
                style={{ width: `${(done / total) * 100}%` }}
                title={`${done} done`}
              />
            )}
            {inProgress > 0 && (
              <span
                className="bg-blue-500"
                style={{ width: `${(inProgress / total) * 100}%` }}
                title={`${inProgress} in progress`}
              />
            )}
            {other > 0 && (
              <span
                className="bg-slate-400"
                style={{ width: `${(other / total) * 100}%` }}
                title={`${other} backlog/other`}
              />
            )}
          </span>
        )}
      </span>
      <span className="text-slate-400">—</span>
      <span>
        {assigneeCount > 0 ? (
          <span className="font-medium text-slate-700">
            {assigneeCount} {assigneeCount === 1 ? "person" : "people"}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </span>
      <span>
        {nextDue ? (
          <span className="font-medium text-slate-700">
            {nextDue.toLocaleDateString()}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </span>
      <span className="text-slate-400">—</span>
    </div>
  );
}
