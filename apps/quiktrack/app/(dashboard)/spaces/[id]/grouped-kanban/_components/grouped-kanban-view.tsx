"use client";

import Link from "next/link";
import { MouseEvent, useEffect, useMemo, useState } from "react";
import type {
  BoardMemberLite,
  GroupedBoardFilters,
  GroupedBoardTask,
  SprintLite,
} from "../_types";
import { EMPTY_FILTERS, NO_ACTIVE_SPRINT_SENTINEL } from "../_types";
import { useGroupedBoard } from "../_hooks/useGroupedBoard";
import {
  useCreateGroup,
  useDeleteGroup,
  useRecolorGroup,
  useRenameGroup,
  useToggleGroupCollapse,
} from "../_hooks/useGroupMutations";
import {
  useDeleteTask,
  useMoveTask,
  useUpdateTaskField,
} from "../_hooks/useTaskMutations";
import { BulkActionsBar } from "./bulk-actions-bar";
import { GroupedKanbanToolbar } from "./grouped-kanban-toolbar";
import { GroupSection } from "./group-section";
import { DndProvider } from "./dnd/dnd-provider";
import { CreateGroupModal } from "./modals/create-group-modal";
import { TaskContextMenu } from "./context-menu/task-context-menu";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { CreateIssueModal } from "@/components/create-issue-modal";

export function GroupedKanbanView({ projectId }: { projectId: string }) {
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<GroupedBoardFilters>(EMPTY_FILTERS);

  useEffect(() => {
    const t = setTimeout(
      () => setFilters((prev) => ({ ...prev, search: searchInput.trim() })),
      300,
    );
    return () => clearTimeout(t);
  }, [searchInput]);

  const board = useGroupedBoard(projectId, filters);
  const ctx = useMemo(() => ({ projectId, filters }), [projectId, filters]);

  const renameGroup = useRenameGroup(ctx);
  const recolorGroup = useRecolorGroup(ctx);
  const toggleCollapse = useToggleGroupCollapse(ctx);
  const deleteGroup = useDeleteGroup(ctx);
  const createGroup = useCreateGroup(ctx);
  const updateTask = useUpdateTaskField(ctx);
  const moveTask = useMoveTask(ctx);
  const deleteTask = useDeleteTask(ctx);

  const [members, setMembers] = useState<BoardMemberLite[]>([]);
  const [sprints, setSprints] = useState<SprintLite[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    task: GroupedBoardTask;
    x: number;
    y: number;
  } | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleTaskSelected(taskId: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }
  function toggleGroupSelected(taskIds: string[], select: boolean) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (select) taskIds.forEach((id) => next.add(id));
      else taskIds.forEach((id) => next.delete(id));
      return next;
    });
  }
  function clearSelection() {
    setSelectedTaskIds(new Set());
  }

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/api/projects/${projectId}/members`).then((r) => r.json()),
      fetch(`/api/sprints?projectId=${projectId}`).then((r) => r.json()),
    ])
      .then(([mRes, sRes]) => {
        if (!alive) return;
        const list = Array.isArray(mRes?.data?.members)
          ? mRes.data.members
          : Array.isArray(mRes?.data)
            ? mRes.data
            : [];
        setMembers(list);
        setSprints(sRes?.success ? sRes.data ?? [] : []);
      })
      .catch(() => {
        /* sidecar failure is non-fatal */
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const activeSprint = useMemo(
    () => sprints.find((s) => s.status === "ACTIVE") ?? null,
    [sprints],
  );

  useEffect(() => {
    const targetSprintId = activeSprint?.id ?? NO_ACTIVE_SPRINT_SENTINEL;
    setFilters((prev) =>
      prev.sprintId === targetSprintId ? prev : { ...prev, sprintId: targetSprintId },
    );
  }, [activeSprint]);

  const onTaskContextMenu = (e: MouseEvent, task: GroupedBoardTask) => {
    setContextMenu({ task, x: e.clientX, y: e.clientY });
  };

  if (board.isLoading && !board.data) {
    return (
      <div className="px-3 sm:px-6 py-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-50 border border-gray-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }
  if (board.isError) {
    return (
      <div className="px-3 sm:px-6 py-4">
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Failed to load grouped board:{" "}
          {board.error instanceof Error ? board.error.message : "unknown error"}
        </div>
      </div>
    );
  }
  if (!board.data) return null;

  const { groups, statuses, defaultGroupId } = board.data;
  const showNoSprintBanner = !activeSprint;

  return (
    <div className="px-3 sm:px-6 py-4">
      <GroupedKanbanToolbar
        filters={{ ...filters, search: searchInput }}
        onFilterChange={(next) => {
          setSearchInput(next.search);
          setFilters({ ...next, search: filters.search });
        }}
        activeSprint={activeSprint}
        members={members}
        onCreateGroup={() => setCreateOpen(true)}
        onCreateTask={() => setCreateTaskOpen(true)}
      />

      {showNoSprintBanner && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-900">No active sprint</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Tasks only appear in Grouped Kanban while their sprint is started.
              Plan and start a sprint from the backlog to see work here.
            </p>
          </div>
          <Link
            href={`/spaces/${projectId}/backlog`}
            className="self-start sm:self-auto shrink-0 inline-flex items-center h-8 px-3 text-xs font-medium rounded bg-white border border-amber-300 text-amber-900 hover:bg-amber-100"
          >
            Go to Backlog
          </Link>
        </div>
      )}

      <DndProvider>
        <div className="space-y-3 pb-12">
          {groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              statuses={statuses}
              members={members}
              sprints={sprints}
              onPatchTask={(id, patch) => updateTask.mutate({ id, patch })}
              onRenameGroup={(id, name) => renameGroup.mutate({ id, name })}
              onRecolorGroup={(id, color) => recolorGroup.mutate({ id, color })}
              onToggleCollapse={(id, isCollapsed) =>
                toggleCollapse.mutate({ id, isCollapsed })
              }
              onAddTask={() => setCreateTaskOpen(true)}
              onDeleteGroup={(id) => {
                if (
                  window.confirm(
                    "Delete this group? Its tasks will move to the Ungrouped bucket.",
                  )
                ) {
                  deleteGroup.mutate(id);
                }
              }}
              onOpenTask={setOpenTaskId}
              onTaskContextMenu={onTaskContextMenu}
              selectedTaskIds={selectedTaskIds}
              onToggleTaskSelected={toggleTaskSelected}
              onToggleGroupSelected={toggleGroupSelected}
              onTaskDropped={(taskId) => {
                const persistGroupId = g.id === defaultGroupId ? null : g.id;
                moveTask.mutate({
                  id: taskId,
                  toGroupId: persistGroupId,
                  toIndex: g.tasks.length,
                });
              }}
              onGroupDropped={() => {}}
            />
          ))}
          {groups.length === 0 && (
            <div className="rounded border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
              No groups yet. Click <strong>New group</strong> to create one — your
              existing tasks will live in the Ungrouped bucket until you move them.
            </div>
          )}
        </div>
      </DndProvider>

      <CreateGroupModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        groups={groups}
        onCreate={async ({ name, color, taskIds }) => {
          const created = await createGroup.mutateAsync({ name, color });
          for (let i = 0; i < taskIds.length; i++) {
            await moveTask.mutateAsync({
              id: taskIds[i],
              toGroupId: created.id,
              toIndex: i,
            });
          }
        }}
      />

      {contextMenu && (
        <TaskContextMenu
          ctx={{
            task: contextMenu.task,
            defaultGroupId,
            isDefaultGroup:
              (contextMenu.task.groupId ?? defaultGroupId) === defaultGroupId,
            openDetail: setOpenTaskId,
            deleteTask: (id) => deleteTask.mutate(id),
            moveToGroup: (id, toGroupId) => {
              const target = groups.find(
                (g) => g.id === (toGroupId ?? defaultGroupId),
              );
              const idx = target?.tasks.length ?? 0;
              moveTask.mutate({ id, toGroupId, toIndex: idx });
            },
            groups: groups.map((g) => ({
              id: g.id,
              name: g.name,
              isDefault: g.isDefault,
            })),
          }}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      <EditIssueModal
        open={openTaskId !== null}
        issueId={openTaskId}
        projectId={projectId}
        onClose={() => setOpenTaskId(null)}
        onSaved={() => board.refetch()}
      />

      <CreateIssueModal
        open={createTaskOpen}
        onClose={() => {
          setCreateTaskOpen(false);
          void board.refetch();
        }}
        initialProjectId={projectId}
      />

      <BulkActionsBar
        allTasks={groups.flatMap((g) => g.tasks)}
        groups={groups}
        statuses={statuses}
        sprints={sprints}
        members={members}
        selectedIds={selectedTaskIds}
        onClear={clearSelection}
        onDelete={(taskIds) => {
          taskIds.forEach((id) => deleteTask.mutate(id));
          clearSelection();
        }}
        onMove={(taskIds, toGroupId) => {
          const targetIdx =
            groups.find((g) => g.id === (toGroupId ?? defaultGroupId))?.tasks
              .length ?? 0;
          taskIds.forEach((id, i) =>
            moveTask.mutate({ id, toGroupId, toIndex: targetIdx + i }),
          );
          clearSelection();
        }}
      />
    </div>
  );
}
