"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardIssue, BoardStatus, EpicLite } from "./board-meta";
import { STATUS_ICON, STATUS_ICON_CLASS } from "./board-meta";
import { TaskCard } from "./task-card";
import { ColumnMenu } from "./column-menu";
import {
  ColumnInlineCreate,
  type ColumnInlineCreateMember,
} from "./column-inline-create";

const PAGE_SIZE = 25;

interface ColumnState {
  issues: BoardIssue[];
  cursor: string | null;
  loading: boolean;
  hasMore: boolean;
  total: number;
  loaded: boolean;
}

const empty: ColumnState = {
  issues: [],
  cursor: null,
  loading: false,
  hasMore: true,
  total: 0,
  loaded: false,
};

/**
 * One status column on the kanban board. Owns its own pagination state +
 * IntersectionObserver sentinel — scrolling near the bottom fetches the next
 * page. Server filter is `excludeType=SUBTASK`; subtasks are loaded lazily
 * by the individual `TaskCard` when the user expands its disclosure.
 */
export function BoardColumn({
  status,
  allStatuses,
  projectId,
  sprintId,
  epicsById,
  statusesById,
  filters,
  members,
  availableSprints,
  onOpen,
  onColumnRenamed,
  onColumnDeleted,
  dragHandlers,
}: {
  status: BoardStatus;
  allStatuses: BoardStatus[];
  projectId: string;
  sprintId: string;
  epicsById: Record<string, EpicLite>;
  statusesById: Record<string, BoardStatus>;
  filters?: { search: string; assigneeId: string; type: string; priority: string };
  members: ColumnInlineCreateMember[];
  availableSprints: { id: string; name: string }[];
  onOpen?: (id: string) => void;
  onColumnRenamed: (s: BoardStatus) => void;
  onColumnDeleted: (id: string) => void;
  dragHandlers?: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}) {
  const [state, setState] = useState<ColumnState>(empty);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ColumnState>(empty);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const loadMore = useCallback(
    async (initial = false) => {
      setState((s) => {
        if (s.loading) return s;
        if (!initial && !s.hasMore) return s;
        return { ...s, loading: true };
      });
      const params = new URLSearchParams({
        projectId,
        sprintId,
        statusId: status.id,
        excludeType: "SUBTASK",
        limit: String(PAGE_SIZE),
      });
      if (filters?.search) params.set("search", filters.search);
      if (filters?.assigneeId) params.set("assigneeId", filters.assigneeId);
      if (filters?.type) params.set("type", filters.type);
      if (filters?.priority) params.set("priority", filters.priority);
      if (!initial) {
        const cursor = stateRef.current?.cursor;
        if (cursor) params.set("cursor", cursor);
      }
      try {
        const res = await fetch(`/api/issues?${params.toString()}`).then((r) => r.json());
        if (!res?.success) {
          setState((s) => ({ ...s, loading: false, loaded: true }));
          return;
        }
        setState((s) => ({
          loading: false,
          loaded: true,
          issues: initial ? res.data : [...s.issues, ...res.data],
          cursor: res.nextCursor,
          hasMore: !!res.nextCursor,
          total: res.total ?? s.total,
        }));
      } catch {
        setState((s) => ({ ...s, loading: false, loaded: true }));
      }
    },
    [projectId, sprintId, status.id, filters?.search, filters?.assigneeId, filters?.type, filters?.priority],
  );

  useEffect(() => {
    setState(empty);
    void loadMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sprintId, status.id, filters?.search, filters?.assigneeId, filters?.type, filters?.priority]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && state.hasMore && !state.loading) {
            void loadMore(false);
          }
        }
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [state.hasMore, state.loading, loadMore]);

  // Flatten the column into individual task cards. Epics never render as
  // their own card or as a folder header on the board — when a task has an
  // epic it surfaces as a colored chip inside the card itself.
  const flatTasks = useMemo(
    () => state.issues.filter((i) => i.type !== "EPIC" && i.type !== "SUBTASK"),
    [state.issues],
  );
  const membersById = useMemo(() => {
    const map: Record<string, ColumnInlineCreateMember> = {};
    for (const m of members) map[m.userId] = m;
    return map;
  }, [members]);
  const Icon = STATUS_ICON(status.category);
  const total = state.total || state.issues.length;

  return (
    <div
      className="group w-[300px] shrink-0 bg-gray-50 rounded p-2 flex flex-col max-h-[calc(100vh-180px)]"
      onDragOver={dragHandlers?.onDragOver}
      onDrop={dragHandlers?.onDrop}
    >
      <div
        className="flex items-center justify-between px-1 mb-2 shrink-0"
        draggable={!!dragHandlers}
        onDragStart={dragHandlers?.onDragStart}
        style={{ cursor: dragHandlers ? "grab" : "default" }}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase text-gray-700">
          {status.name}
          <Icon className={`h-3.5 w-3.5 ${STATUS_ICON_CLASS(status.category)}`} />
          <span className="ml-1 text-[10px] font-normal text-gray-500 normal-case tracking-normal">
            {state.issues.length} of {total}
          </span>
        </div>
        <ColumnMenu
          status={status}
          otherStatuses={allStatuses.filter((s) => s.id !== status.id)}
          projectId={projectId}
          onRenamed={onColumnRenamed}
          onDeleted={onColumnDeleted}
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {!state.loaded && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="bg-white rounded border border-gray-200 p-3 space-y-2">
                <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {state.loaded && state.issues.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-6">No items</div>
        )}

        {flatTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            projectId={projectId}
            epicsById={epicsById}
            statusesById={statusesById}
            membersById={membersById}
            onOpen={onOpen}
          />
        ))}

        {state.hasMore && (
          <div ref={sentinelRef} className="py-2">
            {state.loading && (
              <div className="h-3 w-1/2 mx-auto rounded bg-gray-200 animate-pulse" />
            )}
          </div>
        )}
      </div>

      <ColumnInlineCreate
        projectId={projectId}
        statusId={status.id}
        members={members}
        availableSprints={availableSprints}
        onOpenIssue={onOpen}
      />
    </div>
  );
}

