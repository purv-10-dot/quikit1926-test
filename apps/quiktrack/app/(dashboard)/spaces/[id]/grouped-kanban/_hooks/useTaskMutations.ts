"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  GroupedBoardFilters,
  GroupedBoardPayload,
  GroupedBoardTask,
} from "../_types";
import { groupedBoardKey } from "./useGroupedBoard";

interface MutationContext {
  projectId: string;
  filters: GroupedBoardFilters;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as
    | { success: true; data: T }
    | { success: false; error: string };
  if (!json.success) throw new Error(json.error);
  return json.data;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as
    | { success: true; data: T }
    | { success: false; error: string };
  if (!json.success) throw new Error(json.error);
  return json.data;
}

function snapshot(qc: ReturnType<typeof useQueryClient>, ctx: MutationContext) {
  const key = groupedBoardKey(ctx.projectId, ctx.filters);
  return { key, prev: qc.getQueryData<GroupedBoardPayload>(key) };
}

function patchTaskInCache(
  qc: ReturnType<typeof useQueryClient>,
  ctx: MutationContext,
  taskId: string,
  patch: Partial<GroupedBoardTask>,
) {
  const key = groupedBoardKey(ctx.projectId, ctx.filters);
  qc.setQueryData<GroupedBoardPayload>(key, (prev) =>
    !prev
      ? prev
      : {
          ...prev,
          groups: prev.groups.map((g) => ({
            ...g,
            tasks: g.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
          })),
        },
  );
}

export function useUpdateTaskField(ctx: MutationContext) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<GroupedBoardTask> }) =>
      patchJson<GroupedBoardTask>(`/api/issues/${input.id}`, input.patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) });
      const { prev } = snapshot(qc, ctx);
      patchTaskInCache(qc, ctx, id, patch);
      return { prev };
    },
    onError: (_e, _v, c) =>
      c?.prev && qc.setQueryData(groupedBoardKey(ctx.projectId, ctx.filters), c.prev),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) }),
  });
}

interface MoveTaskInput {
  id: string;
  toGroupId: string | null;
  toIndex: number;
}

export function useMoveTask(ctx: MutationContext) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, toGroupId, toIndex }: MoveTaskInput) =>
      postJson<{ id: string; groupId: string | null; orderInGroup: number }>(
        `/api/groups/move-task`,
        { issueId: id, toGroupId, toIndex },
      ),
    onMutate: async ({ id, toGroupId, toIndex }) => {
      await qc.cancelQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) });
      const { prev } = snapshot(qc, ctx);
      const key = groupedBoardKey(ctx.projectId, ctx.filters);
      qc.setQueryData<GroupedBoardPayload>(key, (board) => {
        if (!board) return board;
        const targetGroupId = toGroupId ?? board.defaultGroupId;
        let moving: GroupedBoardTask | undefined;
        const groupsWithoutTask = board.groups.map((g) => {
          const idx = g.tasks.findIndex((t) => t.id === id);
          if (idx < 0) return g;
          moving = g.tasks[idx];
          const next = [...g.tasks];
          next.splice(idx, 1);
          return { ...g, tasks: next, taskCount: g.taskCount - 1 };
        });
        if (!moving) return board;
        const updatedMoving: GroupedBoardTask = {
          ...moving,
          groupId: toGroupId,
          orderInGroup: toIndex,
        };
        return {
          ...board,
          groups: groupsWithoutTask.map((g) => {
            if (g.id !== targetGroupId) return g;
            const next = [...g.tasks];
            const safeIdx = Math.min(toIndex, next.length);
            next.splice(safeIdx, 0, updatedMoving);
            return { ...g, tasks: next, taskCount: g.taskCount + 1 };
          }),
        };
      });
      return { prev };
    },
    onError: (_e, _v, c) =>
      c?.prev && qc.setQueryData(groupedBoardKey(ctx.projectId, ctx.filters), c.prev),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) }),
  });
}

export function useDeleteTask(ctx: MutationContext) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/issues/${id}`, { method: "DELETE" });
      const json = (await res.json()) as
        | { success: true; data: { id: string } }
        | { success: false; error: string };
      if (!json.success) throw new Error(json.error);
      return json.data;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) });
      const { prev } = snapshot(qc, ctx);
      qc.setQueryData<GroupedBoardPayload>(
        groupedBoardKey(ctx.projectId, ctx.filters),
        (b) =>
          !b
            ? b
            : {
                ...b,
                groups: b.groups.map((g) => ({
                  ...g,
                  tasks: g.tasks.filter((t) => t.id !== id),
                  taskCount: g.tasks.some((t) => t.id === id)
                    ? g.taskCount - 1
                    : g.taskCount,
                })),
              },
      );
      return { prev };
    },
    onError: (_e, _v, c) =>
      c?.prev && qc.setQueryData(groupedBoardKey(ctx.projectId, ctx.filters), c.prev),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: groupedBoardKey(ctx.projectId, ctx.filters) }),
  });
}
