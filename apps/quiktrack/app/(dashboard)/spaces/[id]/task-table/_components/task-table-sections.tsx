"use client";

import { useCallback, useState } from "react";
import { Folder } from "lucide-react";
import { useInfiniteIssues } from "@/lib/hooks/useInfiniteIssues";
import {
  EmptyChildrenRow,
  GroupHeaderRow,
  TaskTableRow,
  TaskTableSkeletonRow,
  type TaskRowContext,
} from "./task-table-row";
import type { TaskIssue } from "./task-types";

const SKELETON_INITIAL_COUNT = 4;

interface SectionCtx extends TaskRowContext {
  projectId: string;
}

function SentinelRow({ refCb }: { refCb: (el: HTMLElement | null) => void }) {
  // 1px-tall row used as the IntersectionObserver target. Hidden visually
  // but takes up no space; just needs to be in the document flow so the
  // observer fires when it scrolls into view.
  return (
    <tr ref={(el) => refCb(el as unknown as HTMLElement | null)} aria-hidden>
      <td colSpan={10} className="h-px" />
    </tr>
  );
}

function deleteIssueAndReload(id: string, reload: () => void) {
  if (typeof window !== "undefined" && !window.confirm("Delete this work item? This is reversible from trash.")) return;
  fetch(`/api/issues/${id}`, { method: "DELETE" })
    .then((r) => r.json() as Promise<{ success: boolean; error?: string }>)
    .then((res) => {
      if (!res.success) throw new Error(res.error ?? "Delete failed");
      reload();
    })
    .catch((e) => {
      if (typeof window !== "undefined") window.alert(e instanceof Error ? e.message : "Delete failed");
    });
}

function patchIssueAndReload(id: string, patch: Record<string, unknown>, reload: () => void) {
  fetch(`/api/issues/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
    .then((r) => r.json() as Promise<{ success: boolean; error?: string }>)
    .then((res) => {
      if (!res.success) throw new Error(res.error ?? "Save failed");
      reload();
    })
    .catch((e) => {
      if (typeof window !== "undefined") window.alert(e instanceof Error ? e.message : "Save failed");
    });
}

// ── Without Parent group ─────────────────────────────────────────────────────

export function WithoutParentSection({ ctx }: { ctx: SectionCtx }) {
  const [expanded, setExpanded] = useState(false);
  const result = useInfiniteIssues<TaskIssue>(
    { projectId: ctx.projectId, epicId: "null", excludeType: "EPIC,SUBTASK" },
    expanded,
  );
  const onDelete = useCallback((id: string) => deleteIssueAndReload(id, result.reload), [result.reload]);
  const onPatchIssue = useCallback(
    (id: string, patch: Record<string, unknown>) => patchIssueAndReload(id, patch, result.reload),
    [result.reload],
  );
  const childCtx: TaskRowContext = { ...ctx, onDelete, onPatchIssue };

  return (
    <>
      <GroupHeaderRow
        label="Without Parent"
        count={expanded ? result.total : undefined}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        Icon={Folder}
        iconClass="text-gray-400"
      />
      {expanded && (
        <>
          {result.loading &&
            Array.from({ length: SKELETON_INITIAL_COUNT }).map((_, i) => (
              <TaskTableSkeletonRow key={`wp-skel-${i}`} depth={1} />
            ))}
          {result.items.map((issue) => (
            <TaskWithSubtasks key={issue.id} issue={issue} depth={1} ctx={childCtx} projectId={ctx.projectId} />
          ))}
          {result.loadingMore && <TaskTableSkeletonRow depth={1} />}
          {!result.loading && !result.loadingMore && result.items.length === 0 && (
            <EmptyChildrenRow message="No items without an epic." depth={1} />
          )}
          {result.hasMore && <SentinelRow refCb={result.sentinelRef} />}
        </>
      )}
    </>
  );
}

// ── Epics list (top-level, always loaded) ────────────────────────────────────

export function EpicsSection({ ctx }: { ctx: SectionCtx }) {
  const result = useInfiniteIssues<TaskIssue>(
    { projectId: ctx.projectId, type: "EPIC" },
    true,
  );
  const onDelete = useCallback((id: string) => deleteIssueAndReload(id, result.reload), [result.reload]);
  const onPatchIssue = useCallback(
    (id: string, patch: Record<string, unknown>) => patchIssueAndReload(id, patch, result.reload),
    [result.reload],
  );
  const childCtx: TaskRowContext = { ...ctx, onDelete, onPatchIssue };

  return (
    <>
      {result.loading &&
        Array.from({ length: SKELETON_INITIAL_COUNT }).map((_, i) => (
          <TaskTableSkeletonRow key={`epic-skel-${i}`} depth={0} />
        ))}
      {result.items.map((epic) => (
        <EpicWithTasks key={epic.id} epic={epic} ctx={childCtx} projectId={ctx.projectId} />
      ))}
      {result.loadingMore && <TaskTableSkeletonRow depth={0} />}
      {!result.loading && !result.loadingMore && result.items.length === 0 && (
        <EmptyChildrenRow message="No epics in this project." depth={0} />
      )}
      {result.hasMore && <SentinelRow refCb={result.sentinelRef} />}
    </>
  );
}

// ── Single epic + its tasks (lazy on expand) ─────────────────────────────────

function EpicWithTasks({
  epic,
  projectId,
  ctx,
}: {
  epic: TaskIssue;
  projectId: string;
  ctx: TaskRowContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const result = useInfiniteIssues<TaskIssue>(
    { projectId, epicId: epic.id, excludeType: "SUBTASK" },
    expanded,
  );
  const onDelete = useCallback((id: string) => deleteIssueAndReload(id, result.reload), [result.reload]);
  const onPatchIssue = useCallback(
    (id: string, patch: Record<string, unknown>) => patchIssueAndReload(id, patch, result.reload),
    [result.reload],
  );
  const childCtx: TaskRowContext = { ...ctx, onDelete, onPatchIssue };

  return (
    <>
      <TaskTableRow
        issue={epic}
        depth={0}
        expanded={expanded}
        onToggleExpand={() => setExpanded((e) => !e)}
        ctx={ctx}
      />
      {expanded && (
        <>
          {result.loading &&
            Array.from({ length: 2 }).map((_, i) => (
              <TaskTableSkeletonRow key={`epic-${epic.id}-skel-${i}`} depth={1} />
            ))}
          {result.items.map((task) => (
            <TaskWithSubtasks
              key={task.id}
              issue={task}
              depth={1}
              ctx={childCtx}
              projectId={projectId}
            />
          ))}
          {result.loadingMore && <TaskTableSkeletonRow depth={1} />}
          {!result.loading && !result.loadingMore && result.items.length === 0 && (
            <EmptyChildrenRow message="No tasks under this epic yet." depth={1} />
          )}
          {result.hasMore && <SentinelRow refCb={result.sentinelRef} />}
        </>
      )}
    </>
  );
}

// ── Single task + its subtasks (lazy on expand if any exist) ─────────────────

function TaskWithSubtasks({
  issue,
  depth,
  projectId,
  ctx,
}: {
  issue: TaskIssue;
  depth: number;
  projectId: string;
  ctx: TaskRowContext;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSubtasks = (issue.subtaskCount ?? 0) > 0;
  const result = useInfiniteIssues<TaskIssue>(
    { projectId, parentId: issue.id },
    expanded && hasSubtasks,
  );
  const onDelete = useCallback((id: string) => deleteIssueAndReload(id, result.reload), [result.reload]);
  const onPatchIssue = useCallback(
    (id: string, patch: Record<string, unknown>) => patchIssueAndReload(id, patch, result.reload),
    [result.reload],
  );
  const childCtx: TaskRowContext = { ...ctx, onDelete, onPatchIssue };

  return (
    <>
      <TaskTableRow
        issue={issue}
        depth={depth}
        expanded={hasSubtasks ? expanded : undefined}
        onToggleExpand={hasSubtasks ? () => setExpanded((e) => !e) : undefined}
        ctx={ctx}
      />
      {expanded && (
        <>
          {!hasSubtasks ? (
            <EmptyChildrenRow message="No subtasks found" depth={depth + 1} />
          ) : (
            <>
              {result.loading &&
                Array.from({ length: 2 }).map((_, i) => (
                  <TaskTableSkeletonRow key={`t-${issue.id}-skel-${i}`} depth={depth + 1} />
                ))}
              {result.items.map((sub) => (
                <TaskTableRow
                  key={sub.id}
                  issue={sub}
                  depth={depth + 1}
                  ctx={childCtx}
                />
              ))}
              {result.loadingMore && <TaskTableSkeletonRow depth={depth + 1} />}
              {!result.loading && !result.loadingMore && result.items.length === 0 && (
                <EmptyChildrenRow message="No subtasks found" depth={depth + 1} />
              )}
              {result.hasMore && <SentinelRow refCb={result.sentinelRef} />}
            </>
          )}
        </>
      )}
    </>
  );
}
