"use client";

import Link from "next/link";
import { MouseEvent, useEffect, useMemo, useState } from "react";
import type {
  BoardMemberLite,
  GroupedBoardFilters,
  GroupedBoardTask,
  SprintLite,
} from "../_types";
import { EMPTY_FILTERS } from "../_types";
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
import { useFieldGrouping } from "../_hooks/useFieldGrouping";
import { decodeFieldPatch } from "../_lib/field-grouping";
import { BulkActionsBar } from "./bulk-actions-bar";
import { GroupedKanbanToolbar } from "./grouped-kanban-toolbar";
import { GroupSection } from "./group-section";
import { DndProvider } from "./dnd/dnd-provider";
import { CreateGroupModal } from "./modals/create-group-modal";
import { TaskContextMenu } from "./context-menu/task-context-menu";
import { EditIssueModal } from "@/components/edit-issue-modal";
import { CreateIssueModal } from "@/components/create-issue-modal";
import { useQueryClient } from "@tanstack/react-query";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMembersChanged } from "@/lib/hooks/useMembersChanged";
import { confirmDialog } from "@/lib/ui/confirm";

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

  const queryClient = useQueryClient();
  // Shared project lookups via React Query (same keys as the other space views).
  const { data: members = [] } = useApiData<BoardMemberLite[]>(
    ["quiktrack", "project-members", projectId],
    `/api/projects/${projectId}/members`,
    {
      select: (d) => {
        const payload = d as { members?: BoardMemberLite[] } | BoardMemberLite[] | null;
        return Array.isArray(payload) ? payload : payload?.members ?? [];
      },
    },
  );
  const { data: sprints = [] } = useApiData<SprintLite[]>(
    ["quiktrack", "project-sprints", projectId],
    `/api/sprints?projectId=${projectId}`,
  );
  // Epics — used to label groups when grouping by Epic.
  const { data: epics = [] } = useApiData<{ id: string; key: string; title: string }[]>(
    ["quiktrack", "project-epics", projectId],
    `/api/issues?projectId=${projectId}&type=EPIC&limit=200`,
    {
      select: (d) =>
        (Array.isArray(d) ? d : []).map((e: { id: string; key: string; title: string }) => ({
          id: e.id,
          key: e.key,
          title: e.title,
        })),
    },
  );
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

  // Grouping axis — "manual" custom groups (server-backed) or a field-derived
  // grouping (status/priority/assignee/type). Must be called unconditionally,
  // so it tolerates board.data being absent while loading.
  const fieldGrouping = useFieldGrouping({
    projectId,
    manualGroups: board.data?.groups ?? [],
    statuses: board.data?.statuses ?? [],
    members,
    epics,
  });

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

  // Refetch members when membership changes via the Add-people modal.
  useMembersChanged(projectId, () => {
    void queryClient.invalidateQueries({
      queryKey: ["quiktrack", "project-members", projectId],
    });
  });

  // Grouped Kanban is active-work only — default filter ("all") already
  // unions every ACTIVE sprint server-side. No auto-lock needed.
  const hasActiveSprint = useMemo(
    () => sprints.some((s) => s.status === "ACTIVE"),
    [sprints],
  );

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

  const { statuses, defaultGroupId } = board.data;
  const manualGroups = board.data.groups;
  // What we actually render & target: server groups in manual mode, derived
  // virtual groups in a field mode.
  const groups = fieldGrouping.displayGroups;
  const isVirtual = fieldGrouping.isVirtual;
  const showNoSprintBanner = !hasActiveSprint;

  return (
    // Content-sized block that scrolls inside the parent layout's single
    // scroll container (SpaceLayout's `flex-1 overflow-y-auto`), exactly like
    // the summary view. We intentionally do NOT add our own `overflow-y-auto`
    // here — a nested scroll container stacked on the parent's let you scroll
    // the inner region into its own empty fill area, which is the dead space
    // that showed up only on this view. `min-w-0` keeps each group's
    // horizontal scroll self-contained (same guard the board view uses).
    <div className="px-3 sm:px-6 py-4 min-w-0">
      <GroupedKanbanToolbar
        filters={{ ...filters, search: searchInput }}
        onFilterChange={(next) => {
          setSearchInput(next.search);
          setFilters({ ...next, search: filters.search });
        }}
        sprints={sprints}
        members={members}
        groupBy={fieldGrouping.groupBy}
        onGroupByChange={fieldGrouping.setGroupBy}
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
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              virtual={isVirtual}
              statuses={statuses}
              members={members}
              sprints={sprints}
              onPatchTask={(id, patch) => updateTask.mutate({ id, patch })}
              onRenameGroup={(id, name) => renameGroup.mutate({ id, name })}
              onRecolorGroup={(id, color) => recolorGroup.mutate({ id, color })}
              onToggleCollapse={(id, isCollapsed) => {
                if (isVirtual) fieldGrouping.toggleVirtualCollapse(id);
                else toggleCollapse.mutate({ id, isCollapsed });
              }}
              onAddTask={() => setCreateTaskOpen(true)}
              onDeleteGroup={async (id) => {
                const ok = await confirmDialog({
                  title: "Delete group",
                  message: "Delete this group? Its tasks will move to the Ungrouped bucket.",
                  confirmText: "Delete",
                  danger: true,
                });
                if (ok) deleteGroup.mutate(id);
              }}
              onOpenTask={setOpenTaskId}
              onTaskContextMenu={onTaskContextMenu}
              selectedTaskIds={selectedTaskIds}
              onToggleTaskSelected={toggleTaskSelected}
              onToggleGroupSelected={toggleGroupSelected}
              onTaskDropped={(taskId) => {
                if (isVirtual) {
                  const patch = decodeFieldPatch(g.id);
                  if (patch) updateTask.mutate({ id: taskId, patch });
                  return;
                }
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
          {groups.length === 0 &&
            (isVirtual ? (
              <div className="rounded border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
                No tasks to group. Tasks will appear here grouped by the field you
                picked once there is active work.
              </div>
            ) : (
              <div className="rounded border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
                No groups yet. Click <strong>New group</strong> to create one — your
                existing tasks will live in the Ungrouped bucket until you move them.
              </div>
            ))}
        </div>
      </DndProvider>

      <CreateGroupModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        groups={manualGroups}
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
              !isVirtual &&
              (contextMenu.task.groupId ?? defaultGroupId) === defaultGroupId,
            openDetail: setOpenTaskId,
            deleteTask: (id) => deleteTask.mutate(id),
            moveToGroup: (id, toGroupId) => {
              if (isVirtual) {
                if (!toGroupId) return;
                const patch = decodeFieldPatch(toGroupId);
                if (patch) updateTask.mutate({ id, patch });
                return;
              }
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
          if (isVirtual) {
            const patch = toGroupId ? decodeFieldPatch(toGroupId) : null;
            if (patch) taskIds.forEach((id) => updateTask.mutate({ id, patch }));
            clearSelection();
            return;
          }
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
